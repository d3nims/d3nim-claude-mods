# jev_prompt_gate.py: UserPromptSubmit 훅 — 사용자 입력이 아래 두 경우인지 로컬 판정기로 가려 Claude 에게 알림을 넣는다.
#   G-1 기존 화면·파일·요소를 기준(레퍼런스)으로 지목한 요청  → 기준은 바꾸지 말고 대상에만 적용하도록
#   G-3 직전 결과를 거부하는 말                              → 추측으로 바로 재시도하지 말고 원인부터 짚도록
#
# 판정 = Ollama bge-m3 임베딩 + 로지스틱 회귀(model/jev_model.json). 생성 없이 확률만 낸다(약 0.1초).
# 설정 = ~/.claude/jev/config.json 또는 환경변수(JEV_MODE, JEV_OLLAMA_URL, JEV_LOG)
#   mode: shadow(기본, 판정만 기록·알림 없음) / enforce(기준값 넘으면 알림) / off
# Ollama 가 없거나 느리면 아무것도 하지 않는다(작업은 그대로 진행).
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime

ROOT = os.environ.get("CLAUDE_PLUGIN_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(ROOT, "model", "jev_model.json")
HOME = os.path.join(os.path.expanduser("~"), ".claude", "jev")
CFG_PATH = os.path.join(HOME, "config.json")
LOG_PATH = os.path.join(HOME, "jev.log")

DEFAULTS = {
    "mode": "shadow",
    "ollama_url": "http://127.0.0.1:11434",  # localhost 는 Windows 에서 IPv6 를 먼저 시도해 약 2초 늦다
    "embed_timeout_sec": 8,                  # 재부팅 직후 모델 적재(수 초)까지 기다린다
    "log": True,                             # 입력 앞부분이 로컬 로그에 남는다. 끄려면 false
}
# 다른 세션·서브에이전트·백그라운드 작업이 보낸 메시지도 이 훅으로 들어온다 — 사람이 쓴 입력만 판정
MACHINE_PREFIXES = ("<cross-session-message", "<agent-message", "<task-notification", "[Cross-session ")

MESSAGES = {
    "g1": ("[jev G-1 레퍼런스 확인] 기존 화면·파일·요소를 기준으로 지목한 요청으로 보인다.\n"
           "① 지목된 기준은 읽기 전용이다 — 바꾸지 말고, 그 구현을 대상에만 같은 방식으로 적용하라.\n"
           "② 작업 전 3줄 확인: (a)이해한 최종 상태 (b)바꾸지 않을 대상 (c)변경 범위(정확한 파일·항목).\n"
           "③ 기준 자체를 바꿔야 한다면 임의로 바꾸지 말고 사용자에게 먼저 묻는다."),
    "g3": ("[jev G-3 재시도 확인] 직전 결과를 거부하는 말로 보인다.\n"
           "추측으로 다른 방식을 바로 재시도하지 말고, 먼저 (a)무엇을 잘못 이해했는지 1줄, "
           "(b)그 방식이 왜 틀렸는지 1줄을 말한 뒤 진행하라."),
}


def load_cfg():
    cfg = dict(DEFAULTS)
    try:
        with open(CFG_PATH, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except Exception:
        pass
    env = {"JEV_MODE": "mode", "JEV_OLLAMA_URL": "ollama_url"}
    for k, v in env.items():
        if os.environ.get(k):
            cfg[v] = os.environ[k]
    if os.environ.get("JEV_LOG"):
        cfg["log"] = os.environ["JEV_LOG"].lower() not in ("0", "false", "off")
    return cfg


def log(cfg, entry):
    if not cfg.get("log"):
        return
    try:
        os.makedirs(HOME, exist_ok=True)
        entry["ts"] = datetime.now().isoformat(timespec="seconds")
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def embed(cfg, text, model):
    body = {"model": model, "input": [text[:1500]], "keep_alive": -1}  # 모델 상주로 두 번째부터 지연 제거
    req = urllib.request.Request(cfg["ollama_url"].rstrip("/") + "/api/embed",
                                 json.dumps(body).encode("utf-8"), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=float(cfg["embed_timeout_sec"])) as r:
        return json.load(r)["embeddings"][0]


def main():
    raw = sys.stdin.buffer.read()
    if raw.startswith(b"\xef\xbb\xbf"):  # PowerShell 파이프는 UTF-8 BOM 을 붙인다
        raw = raw[3:]
    cfg = load_cfg()
    if cfg.get("mode") == "off":
        return
    try:
        prompt = str(json.loads(raw.decode("utf-8")).get("prompt", "") or "")
    except Exception:
        return
    if not prompt.strip() or prompt.lstrip().startswith(MACHINE_PREFIXES):
        return
    try:
        with open(MODEL_PATH, encoding="utf-8") as f:
            model = json.load(f)
        t = time.time()
        x = embed(cfg, prompt, model["embed_model"])
        probs = {}
        for g, m in model["gates"].items():
            z = sum(a * b for a, b in zip(m["w"], x)) * model["scale"] + m["b"]
            probs[g] = round(1 / (1 + math.exp(-z)), 3)
        hits = [g for g, m in model["gates"].items() if probs[g] >= m["threshold"] and g in MESSAGES]
        log(cfg, {"mode": cfg["mode"], "ms": int((time.time() - t) * 1000), "prompt": prompt[:120],
                  "jev": probs, "hit": hits})
    except Exception as e:
        log(cfg, {"error": f"{type(e).__name__}: {e}"[:200]})
        return
    if cfg["mode"] == "enforce" and hits:
        sys.stdout.write(json.dumps({"hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "\n\n".join(MESSAGES[g] for g in hits),
        }}, ensure_ascii=False))


if __name__ == "__main__":
    main()
