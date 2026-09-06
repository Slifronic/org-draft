# Orientation deck

`PBL-orientation.pptx` — 16 slides, 16:9. Open in PowerPoint, Keynote, or
upload to Google Slides.

The content and the geometry live in `deck.js`. Two renderers read it:

    node build-pptx.js      # writes PBL-orientation.pptx
    node build-preview.js   # writes preview.html

`preview.html` draws the same inch geometry in a browser, so the layout can be
checked on a machine with no PowerPoint or LibreOffice on it. `preview.html?s=7`
shows one slide on its own.

To change wording, edit `deck.js` and re-run both. Editing the .pptx directly
works too, but the next build overwrites it.

Fonts are Calibri Light / Calibri / Consolas rather than the site's DM Sans and
Space Grotesk: those are Google fonts and would silently substitute on a laptop
that has never loaded them, which is exactly the machine this gets presented
from.
