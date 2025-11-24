# Font Setup Guide

## Font Configuration

This project uses **Jura** as the primary font for all text elements.

### Font: **Jura**
- ✅ Configured via Google Fonts
- Weights: Regular (400), SemiBold (600), Bold (700)
- Usage: All text elements (headings, body text, buttons, etc.)

## Font Details

The Jura font is automatically loaded from Google Fonts and requires an internet connection. The font is configured with three weights:
- **Regular (400)**: Default body text
- **SemiBold (600)**: Emphasized text, buttons
- **Bold (700)**: Headings and strong emphasis

## Using the Font in Your Code

### CSS Variables
```css
/* Available CSS variables */
--font-family: 'Jura', sans-serif;
--font-regular: 400;
--font-semibold: 600;
--font-bold: 700;
```

### CSS Classes
```css
/* Font weight utilities */
.font-regular    /* 400 */
.font-semibold   /* 600 */
.font-bold       /* 700 */
```

### Example Usage
```jsx
// In your React components
<h1 className="font-bold">Bold Heading</h1>
<p className="font-regular">Regular body text</p>
<button className="font-semibold">Button Text</button>
```

### Direct CSS Usage
```css
/* Using CSS variables */
.custom-element {
  font-family: var(--font-family);
  font-weight: var(--font-semibold);
}
```

## Default Behavior

- **All text elements**: Use Jura Regular by default
- **Headings (h1-h6)**: Automatically use Jura Bold
- **Buttons**: Automatically use Jura SemiBold
- **Paragraphs**: Use Jura Regular with increased line-height (1.6)

## Performance

- Font is loaded from Google Fonts CDN
- Uses `display=swap` for optimal loading performance
- Fallback to system sans-serif if font fails to load
