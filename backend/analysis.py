"""Spatial and wireless heuristics. These are estimates, not RF simulation."""
import math
from statistics import mean


def idw(points, x, y, power=2):
    if not points:
        return None
    distances = [(math.hypot(p['x'] - x, p['y'] - y), p['rssi']) for p in points]
    exact = [v for d, v in distances if d < 1e-9]
    if exact:
        return mean(exact)
    weights = [(1 / d ** power, v) for d, v in distances]
    return sum(w * v for w, v in weights) / sum(w for w, _ in weights)


def analyze(points, networks, size=25):
    grid = []
    for row in range(size):
        for col in range(size):
            x, y = (col + .5) / size, (row + .5) / size
            distance = min((math.hypot(p['x'] - x, p['y'] - y) for p in points), default=None)
            # Only interpolate near actual readings; other cells remain unknown.
            nearby = [p for p in points if math.hypot(p['x'] - x, p['y'] - y) <= .25]
            value = idw(nearby, x, y)
            grid.append({'x': x, 'y': y, 'rssi': round(value, 1) if value is not None else None,
                         'distance': round(distance, 3) if distance is not None else None})
    mapped = [c for c in grid if c['rssi'] is not None]
    weak = [c for c in mapped if c['rssi'] < -75]
    # Find the cell that best represents nearby weak cells. This is a survey lead,
    # not a simulated AP or a promise of improvement.
    candidate = None
    if weak:
        best = max(weak, key=lambda c: sum(max(0, 1 - math.hypot(c['x']-q['x'], c['y']-q['y']) / .22) for q in weak))
        candidate = {'x': best['x'], 'y': best['y'], 'rssi': best['rssi']}
    # Leave out all co-located readings to avoid leakage from repeated samples.
    errors = []
    for p in points:
        others = [q for q in points if math.hypot(q['x'] - p['x'], q['y'] - p['y']) > 1e-9]
        estimate = idw(others, p['x'], p['y'])
        if estimate is not None:
            errors.append(abs(estimate - p['rssi']))
    # 2.4 GHz only: approximate overlapping 20 MHz channels with 5 MHz spacing.
    scores = []
    for channel in (1, 6, 11):
        score = 0.0
        for n in networks:
            ch, rssi = n.get('channel'), n.get('rssi')
            if n.get('band') != '2.4 GHz' or not isinstance(ch, int) or rssi is None:
                continue
            overlap = max(0, 1 - abs(ch - channel) / 5)
            # Power ratio is capped at -30 dBm to avoid implausibly dominant entries.
            score += overlap * 10 ** ((min(rssi, -30) + 100) / 10)
        scores.append({'channel': channel, 'score': round(score, 2)})
    eligible = [n for n in networks if n.get('band') == '2.4 GHz' and isinstance(n.get('channel'), int) and n.get('rssi') is not None]
    return {'grid': grid, 'weak_percent': round(100 * len(weak) / len(mapped), 1) if mapped else None,
            'mapped_percent': round(100 * len(mapped) / len(grid), 1) if points else None,
            'candidate': candidate, 'mae': round(mean(errors), 1) if len({(p['x'], p['y']) for p in points}) >= 3 and errors else None,
            'channel_scores': scores if eligible else [], 'recommended_channel': min(scores, key=lambda s: s['score'])['channel'] if eligible else None}
