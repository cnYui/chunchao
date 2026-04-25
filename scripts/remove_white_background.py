from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="将近白背景转成透明 PNG。")
    parser.add_argument("--input", required=True, help="输入图片路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    parser.add_argument("--opaque-threshold", type=int, default=180, help="亮度低于等于该值时保留为不透明")
    parser.add_argument(
        "--transparent-threshold",
        type=int,
        default=245,
        help="亮度高于等于该值时直接清为透明",
    )
    parser.add_argument(
        "--min-alpha-keep",
        type=int,
        default=128,
        help="低于该 alpha 的残留直接清掉，避免灰雾脏边",
    )
    return parser


def to_luma(red: int, green: int, blue: int) -> float:
    return red * 0.2126 + green * 0.7152 + blue * 0.0722


def resolve_alpha(
    luma: float,
    opaque_threshold: int,
    transparent_threshold: int,
    min_alpha_keep: int,
) -> int:
    if luma <= opaque_threshold:
        return 255

    if luma >= transparent_threshold:
        return 0

    ratio = (transparent_threshold - luma) / (transparent_threshold - opaque_threshold)
    alpha = max(0, min(255, round(ratio * 255)))
    return 0 if alpha < min_alpha_keep else alpha


def remove_white_background(
    input_path: Path,
    output_path: Path,
    opaque_threshold: int,
    transparent_threshold: int,
    min_alpha_keep: int,
) -> None:
    image = Image.open(input_path).convert("RGBA")
    output = Image.new("RGBA", image.size)

    source_pixels = image.load()
    output_pixels = output.load()

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, source_alpha = source_pixels[x, y]
            luma = to_luma(red, green, blue)
            alpha = resolve_alpha(
                luma=luma,
                opaque_threshold=opaque_threshold,
                transparent_threshold=transparent_threshold,
                min_alpha_keep=min_alpha_keep,
            )

            if source_alpha < 255:
                alpha = round(alpha * (source_alpha / 255))

            # 统一写黑色可以压掉彩色抗锯齿边和压缩脏点，便于叠到任意背景上。
            output_pixels[x, y] = (0, 0, 0, alpha)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path)


def main() -> None:
    args = build_parser().parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise FileNotFoundError(f"输入文件不存在: {input_path}")

    if args.transparent_threshold <= args.opaque_threshold:
        raise ValueError("transparent-threshold 必须大于 opaque-threshold")

    remove_white_background(
        input_path=input_path,
        output_path=output_path,
        opaque_threshold=args.opaque_threshold,
        transparent_threshold=args.transparent_threshold,
        min_alpha_keep=args.min_alpha_keep,
    )


if __name__ == "__main__":
    main()
