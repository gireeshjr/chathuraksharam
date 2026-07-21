from pathlib import Path
from textwrap import fill
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "frames"
WIDTH, HEIGHT = 1280, 720
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def background() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT))
    pixels = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            glow = max(0.0, 1.0 - (((x - 900) / 760) ** 2 + ((y - 110) / 540) ** 2))
            pixels[x, y] = (
                int(3 + 5 * glow),
                int(12 + 39 * glow),
                int(8 + 26 * glow),
            )
    return image


def header(draw: ImageDraw.ImageDraw, eyebrow: str, title: str, subtitle: str = "") -> None:
    draw.text((88, 70), eyebrow.upper(), font=font(18, True), fill="#43d5a2", spacing=4)
    draw.text((88, 112), title, font=font(54, True), fill="#f2b84b")
    if subtitle:
        draw.text((90, 184), subtitle, font=font(24), fill="#d8dfda")


def save_title() -> None:
    image = background()
    draw = ImageDraw.Draw(image)
    draw.text((90, 175), "OPENAI BUILD WEEK", font=font(19, True), fill="#43d5a2")
    draw.text((86, 225), "Chathuraksharam", font=font(68, True), fill="#f2b84b")
    draw.text((90, 307), "Word Square", font=font(48, True), fill="#f7eedc")
    draw.text(
        (92, 392),
        "A tactile word game where every language\ngets its own playable alphabet.",
        font=font(31),
        fill="#d9e2dc",
        spacing=14,
    )
    draw.rounded_rectangle((92, 522, 242, 528), radius=3, fill="#43d5a2")
    draw.text((92, 553), "Malayalam  ·  English  ·  Spanish", font=font(21), fill="#aebdb4")
    image.save(FRAMES / "00-title.png")


def save_architecture() -> None:
    image = background()
    draw = ImageDraw.Draw(image)
    header(draw, "Reliable AI content", "Generate once. Validate. Reuse.", "GPT-5.6 expands the game without entering the gameplay request path.")
    steps = [
        ("1", "GPT-5.6", "Culturally natural puzzle candidates"),
        ("2", "Strict JSON schema", "Predictable structured output"),
        ("3", "Unicode validation", "Intl.Segmenter + playable alphabet"),
        ("4", "Human review", "One dependable pack for every player"),
    ]
    x = 72
    for number, title, detail in steps:
        draw.rounded_rectangle((x, 292, x + 260, 520), radius=20, fill="#0c2118", outline="#315442", width=2)
        draw.ellipse((x + 22, 316, x + 72, 366), fill="#f2b84b")
        draw.text((x + 40, 327), number, font=font(20, True), fill="#1a160b", anchor="mm")
        draw.text((x + 22, 392), title, font=font(25, True), fill="#f7eedc")
        draw.multiline_text(
            (x + 22, 438),
            fill(detail, width=22),
            font=font(18),
            fill="#aebdb4",
            spacing=8,
        )
        if number != "4":
            draw.text((x + 273, 393), "→", font=font(34, True), fill="#43d5a2")
        x += 298
    draw.text((88, 603), "No model latency · No runtime API key · Reviewed content", font=font(23, True), fill="#43d5a2")
    image.save(FRAMES / "13-architecture.png")


def save_codex() -> None:
    image = background()
    draw = ImageDraw.Draw(image)
    header(draw, "Built with Codex", "From one language to a reusable engine", "Product decisions stayed human; implementation and testing accelerated.")
    items = [
        "Designed reusable language and category packs",
        "Integrated GPT-5.6 structured authoring",
        "Debugged Unicode, reel sizing, and pointer state",
        "Drove responsive browser tests across three scripts",
    ]
    y = 286
    for item in items:
        draw.rounded_rectangle((92, y, 1128, y + 66), radius=14, fill="#0c2118", outline="#274b39", width=2)
        draw.ellipse((118, y + 22, 140, y + 44), fill="#43d5a2")
        draw.text((162, y + 18), item, font=font(25, True), fill="#eef2ee")
        y += 82
    image.save(FRAMES / "14-codex.png")


def save_close() -> None:
    image = background()
    draw = ImageDraw.Draw(image)
    draw.text((90, 126), "WORDS WITHOUT BORDERS", font=font(19, True), fill="#43d5a2")
    draw.text((86, 182), "Three languages.", font=font(62, True), fill="#f2b84b")
    draw.text((86, 255), "Three streams.", font=font(62, True), fill="#f2b84b")
    draw.text((86, 328), "Unlimited rounds.", font=font(62, True), fill="#f2b84b")
    draw.text((90, 443), "Next: native-reviewed packs for more languages and local culture.", font=font(27), fill="#dce4df")
    draw.rounded_rectangle((90, 536, 496, 600), radius=18, fill="#f2b84b")
    draw.text((293, 568), "chathuraksharam.com", font=font(24, True), fill="#1a160b", anchor="mm")
    image.save(FRAMES / "15-closing.png")


if __name__ == "__main__":
    FRAMES.mkdir(parents=True, exist_ok=True)
    save_title()
    save_architecture()
    save_codex()
    save_close()
