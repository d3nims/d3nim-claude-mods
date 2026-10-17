def summary(name, G, R, durs):
    H = G - min(r['head'] for r in R) + 1
    rng = lambda k: max(r[k] for r in R) - min(r[k] for r in R)
    L = [r['length'] for r in R]
    return dict(name=name, frames=len(R), cycle_ms=sum(durs) if durs else None,
                height=H, head_bob=round(rng('head')/H*100), nose_bob=round(rng('nose')/H*100),
                back_bob=round(rng('back')/H*100), stretch=round(max(L)/min(L), 2),
                feet=[r['feet'] for r in R])
