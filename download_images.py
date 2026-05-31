import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def dl(url, filename):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response, open(filename, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
            print(f"Downloaded {filename}")
    except Exception as e:
        print(f"Failed {filename}: {e}")

dl("https://upload.wikimedia.org/wikipedia/en/5/5a/Optimus_Prime_Transformers_3.png", "optimus.png")
dl("https://upload.wikimedia.org/wikipedia/en/2/29/Megatron_TF1.png", "scourge.png")
