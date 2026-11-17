"""A growing local map. Unsurveyed cells deliberately remain transparent."""
import math
from statistics import mean


def local_metres(latitude, longitude, origin_latitude, origin_longitude):
    radius = 6371000
    delta_lon = (longitude - origin_longitude + 180) % 360 - 180
    return (radius * math.radians(delta_lon) * math.cos(math.radians(origin_latitude)),
            radius * math.radians(latitude - origin_latitude))


def walking_map(points, mode, width=20, height=15, radius=5):
    if mode == 'floorplan':
        bounds = {'min_x': 0, 'max_x': width, 'min_y': 0, 'max_y': height}
    elif points:
        pad = max(10, radius * 1.3)
        xs, ys = [p['x_m'] for p in points], [p['y_m'] for p in points]
        bounds = {'min_x': min(xs) - pad, 'max_x': max(xs) + pad,
                  'min_y': min(ys) - pad, 'max_y': max(ys) + pad}
        # Keep a usable minimum map extent as the first locations arrive.
        for axis in ('x', 'y'):
            low, high = bounds['min_' + axis], bounds['max_' + axis]
            if high - low < 50:
                middle = (low + high) / 2
                bounds['min_' + axis], bounds['max_' + axis] = middle - 25, middle + 25
    else:
        bounds = {'min_x': -25, 'max_x': 25, 'min_y': -20, 'max_y': 20}
    # Average repeated readings in small spatial bins to control cost and avoid
    # stationary sampling overwhelming all other positions.
    bin_size = max(.5, radius / 4)
    grouped = {}
    for point in points:
        key = (math.floor(point['x_m'] / bin_size), math.floor(point['y_m'] / bin_size))
        grouped.setdefault(key, []).append(point)
    aggregated = {key: {'x_m': mean(p['x_m'] for p in group), 'y_m': mean(p['y_m'] for p in group),
                   'rssi': mean(p['rssi'] for p in group)} for key, group in grouped.items()}
    reach = math.ceil(radius / bin_size) + 1
    columns, rows = 56, 40
    dx = (bounds['max_x'] - bounds['min_x']) / columns
    dy = (bounds['max_y'] - bounds['min_y']) / rows
    cells = []
    for row in range(rows):
        for col in range(columns):
            x = bounds['min_x'] + (col + .5) * dx
            y = bounds['min_y'] + (row + .5) * dy
            key_x, key_y = math.floor(x / bin_size), math.floor(y / bin_size)
            neighbours = (aggregated.get((key_x + ix, key_y + iy)) for ix in range(-reach, reach + 1) for iy in range(-reach, reach + 1))
            nearby = [(math.hypot(p['x_m'] - x, p['y_m'] - y), p['rssi']) for p in neighbours if p is not None]
            nearby = [(d, signal) for d, signal in nearby if d <= radius]
            if not nearby:
                continue
            exact = [value for distance, value in nearby if distance < .01]
            value = mean(exact) if exact else sum(value / max(distance, .01)**2 for distance, value in nearby) / sum(1 / max(distance, .01)**2 for distance, _ in nearby)
            cells.append({'x': col, 'y': row, 'rssi': round(value, 1)})
    distance = sum(math.hypot(b['x_m'] - a['x_m'], b['y_m'] - a['y_m']) for a, b in zip(points, points[1:]))
    return {'bounds': bounds, 'columns': columns, 'rows': rows, 'cells': cells,
            'radius_m': radius, 'route_distance_m': round(distance, 1),
            'sampled_area_m2': round(len(cells) * dx * dy, 1)}
