import os
from PIL import Image, ImageDraw, ImageFont

def generate_og_image(out_path_jpg, out_path_png):
    width = 1200
    height = 630

    # Create base image with earthy dark gradient
    img = Image.new("RGB", (width, height), "#2b2017")
    draw = ImageDraw.Draw(img)

    # Draw vertical gradient from #2b2017 to #1f1710
    top_color = (43, 32, 23)
    bot_color = (30, 22, 15)
    for y in range(height):
        ratio = y / height
        r = int(top_color[0] + (bot_color[0] - top_color[0]) * ratio)
        g = int(top_color[1] + (bot_color[1] - top_color[1]) * ratio)
        b = int(top_color[2] + (bot_color[2] - top_color[2]) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Inner elegant gold border
    draw.rounded_rectangle(
        [(24, 24), (width - 24, height - 24)],
        radius=20,
        outline=(234, 208, 175, 120),
        width=3
    )

    # Fonts
    try:
        font_tag = ImageFont.truetype("arialbd.ttf", 22)
        font_title = ImageFont.truetype("arialbd.ttf", 52)
        font_sub = ImageFont.truetype("arial.ttf", 26)
        font_btn = ImageFont.truetype("arialbd.ttf", 22)
    except Exception:
        font_tag = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_btn = ImageFont.load_default()

    # Brand tag: "E A R T H Y S T A Y"
    tag_text = "E A R T H Y S T A Y"
    tag_bbox = draw.textbbox((0, 0), tag_text, font=font_tag)
    tag_w = tag_bbox[2] - tag_bbox[0]
    draw.text(((width - tag_w) // 2, 90), tag_text, fill=(234, 208, 175), font=font_tag)

    # Title line 1 & 2
    title1 = "Discover & Book Unique"
    title2 = "Earthy Properties Across India"
    
    t1_bbox = draw.textbbox((0, 0), title1, font=font_title)
    t1_w = t1_bbox[2] - t1_bbox[0]
    draw.text(((width - t1_w) // 2, 160), title1, fill=(255, 255, 255), font=font_title)

    t2_bbox = draw.textbbox((0, 0), title2, font=font_title)
    t2_w = t2_bbox[2] - t2_bbox[0]
    draw.text(((width - t2_w) // 2, 235), title2, fill=(234, 208, 175), font=font_title)

    # Subtitle / Bio
    sub_text = "Curated Villas  •  Heritage Stays  •  Weddings  •  Corporate Retreats"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
    sub_w = sub_bbox[2] - sub_bbox[0]
    draw.text(((width - sub_w) // 2, 340), sub_text, fill=(217, 194, 168), font=font_sub)

    # Button badge
    btn_text = "Book Your Stay at conceptstay.in"
    btn_bbox = draw.textbbox((0, 0), btn_text, font=font_btn)
    btn_w = btn_bbox[2] - btn_bbox[0]
    btn_h = btn_bbox[3] - btn_bbox[1]

    bx0 = (width - btn_w) // 2 - 32
    by0 = 430
    bx1 = (width + btn_w) // 2 + 32
    by1 = by0 + btn_h + 26

    draw.rounded_rectangle([(bx0, by0), (bx1, by1)], radius=12, fill=(183, 137, 95))
    draw.text(((width - btn_w) // 2, by0 + 13), btn_text, fill=(255, 255, 255), font=font_btn)

    # Save files
    img.save(out_path_jpg, "JPEG", quality=90, optimize=True)
    img.save(out_path_png, "PNG", optimize=True)
    print(f"Saved JPG: {os.path.getsize(out_path_jpg)} bytes")
    print(f"Saved PNG: {os.path.getsize(out_path_png)} bytes")

if __name__ == "__main__":
    generate_og_image(
        r"C:\Users\moham\OneDrive\Documents\project\conceptstay\frontend\public\og-image.jpg",
        r"C:\Users\moham\OneDrive\Documents\project\conceptstay\frontend\public\og-image.png"
    )
