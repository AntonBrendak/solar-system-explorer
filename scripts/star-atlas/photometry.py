"""Bounded, periodic low-frequency calibration. All arithmetic is linear RGB."""
import numpy as np

ALGORITHM = "linear-luminance-periodic-field-highlight-shoulder-v2"
GAIN_MIN, GAIN_MAX = 1 / 16, 16
_codes = np.arange(256, dtype=np.float32) / 255
_srgb_to_linear = np.where(_codes <= .04045, _codes / 12.92, ((_codes + .055) / 1.055) ** 2.4)
_values = np.arange(65536, dtype=np.float32) / 65535
_linear_to_srgb = np.rint(np.where(_values <= .0031308, _values * 12.92,
                                  1.055 * _values ** (1 / 2.4) - .055) * 255).astype(np.uint8)

def linear(rgb):
    return _srgb_to_linear[np.asarray(rgb, dtype=np.uint8)]

def srgb(rgb):
    result = np.empty(rgb.shape, np.uint8)
    for row in range(0, rgb.shape[0], 128):
        indices = np.rint(np.clip(rgb[row:row+128], 0, 1) * 65535).astype(np.uint16)
        result[row:row+128] = _linear_to_srgb[indices]
    return result

def luminance(rgb):
    return rgb @ np.array([.2126, .7152, .0722], dtype=np.float32)

def smooth_periodic(values, radius=8):
    # PIL's float blur is unsupported. Quantise a log field, not image data.
    encoded = np.rint(np.clip((values + 4) / 8, 0, 1) * 65535).astype(np.float32)
    # Separable repeated box filtering has bounded memory, wraps longitude and clamps latitude.
    for _ in range(3):
        for axis in (0, 1):
            mode = "wrap" if axis == 1 else "edge"
            pad = [(0, 0), (0, 0)]
            pad[axis] = (radius, radius)
            padded = np.pad(encoded, pad, mode=mode)
            cumulative = np.cumsum(padded, axis=axis, dtype=np.float64)
            zero = np.zeros_like(np.take(cumulative, [0], axis=axis))
            cumulative = np.concatenate([zero, cumulative], axis=axis)
            high = [slice(None), slice(None)]; low = [slice(None), slice(None)]
            high[axis] = slice(2 * radius + 1, None); low[axis] = slice(None, -2 * radius - 1)
            encoded = ((cumulative[tuple(high)] - cumulative[tuple(low)]) / (2 * radius + 1)).astype(np.float32)
    return encoded / 65535 * 8 - 4

def correction_field(source, reference):
    src, ref = luminance(source), luminance(reference)
    global_gain = float(np.clip(ref.sum() / max(float(src.sum()), 1e-12), GAIN_MIN, GAIN_MAX))
    residual = np.log2(np.maximum(ref, 1e-6) / np.maximum(src * global_gain, 1e-6))
    field = smooth_periodic(residual)
    gains = np.clip(global_gain * np.exp2(field), GAIN_MIN, GAIN_MAX).astype(np.float32)
    return gains, {"globalGain": global_gain, "gainMin": float(gains.min()), "gainMax": float(gains.max()),
                   "logBlurRadius": 8, "logBlurPasses": 3, "bounds": [GAIN_MIN, GAIN_MAX]}

def sample_field(field, column, row, size=2048, columns=32, rows=16):
    # Interpolate in global pixel-centre coordinates, including across the RA seam.
    h, w = field.shape
    xx = ((column * size + np.arange(size) + .5) / (columns * size) * w - .5)
    yy = ((row * size + np.arange(size) + .5) / (rows * size) * h - .5)
    x0 = np.floor(xx).astype(int); y0 = np.floor(yy).astype(int)
    wx = (xx - x0).astype(np.float32); wy = (yy - y0).astype(np.float32)
    top = field[np.clip(y0, 0, h - 1)[:, None], (x0 % w)[None, :]] * (1 - wx)
    top += field[np.clip(y0, 0, h - 1)[:, None], ((x0 + 1) % w)[None, :]] * wx
    bottom = field[np.clip(y0 + 1, 0, h - 1)[:, None], (x0 % w)[None, :]] * (1 - wx)
    bottom += field[np.clip(y0 + 1, 0, h - 1)[:, None], ((x0 + 1) % w)[None, :]] * wx
    return top * (1 - wy[:, None]) + bottom * wy[:, None]

def correct(rgb, gain):
    # Monotonic rational shoulder: g*p/(1+(g-1)*p). Its derivative remains positive;
    # unlike normalising saturated pixels, it retains differences between bright star cores.
    peak = rgb.max(axis=-1)
    scale = gain / (1 + (gain - 1) * peak)
    # Leave one sRGB8 code of headroom, including after encoding quantisation.
    ceiling = ((254 / 255 + .055) / 1.055) ** 2.4
    return rgb * (scale * ceiling)[..., None]
