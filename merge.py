html_file = "cybertron.html"
css_file = "cybertron.css"
js_file = "cybertron.js"
out_file = "Transformers_Cybertron.html"

with open(html_file, "r") as f:
    html_content = f.read()

with open(css_file, "r") as f:
    css_content = f.read()

with open(js_file, "r") as f:
    js_content = f.read()

html_content = html_content.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css_content}\n</style>')
html_content = html_content.replace('<script src="cybertron.js"></script>', f'<script>\n{js_content}\n</script>')

with open(out_file, "w") as f:
    f.write(html_content)
