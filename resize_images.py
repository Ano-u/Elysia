import os
from PIL import Image

temp_dir = os.environ.get('TEMP', 'C:\\temp')
if not os.path.exists(temp_dir):
    os.makedirs(temp_dir, exist_ok=True)

img1_path = r"C:\Users\Zhou zhiyi\Downloads\IMG_3612.PNG"
img2_path = r"C:\Users\Zhou zhiyi\Downloads\IMG_4131(20260324-175639).PNG"

out1 = os.path.join(temp_dir, "compressed_IMG_3612.jpg")
out2 = os.path.join(temp_dir, "compressed_IMG_4131.jpg")

def resize_img(src, dst):
    try:
        with Image.open(src) as img:
            img.thumbnail((800, 800))
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            img.save(dst, "JPEG", quality=85)
            print(f"Success: {dst}")
    except Exception as e:
        print(f"Error processing {src}: {e}")

resize_img(img1_path, out1)
resize_img(img2_path, out2)
