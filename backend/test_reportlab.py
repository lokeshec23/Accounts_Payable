try:
    from reportlab.lib import colors
    print(f"colors module: {colors}")
    print(f"HexColor defined: {hasattr(colors, 'HexColor')}")
except Exception as e:
    print(f"Error: {e}")
