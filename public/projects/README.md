# Adding a project

Every DVD (cover, spine, back, disc) and project page is built from data. You never design a cover by hand.

1. **Put the raw files somewhere**, for example a new `referenceN` folder in `kaanacar-portfolio`: a main photo (PDF, JPG or PNG), the project's PDFs and images, or a video (mp4/mkv/mov).
2. **List them** in `scripts/projects-manifest.json`, by copying an existing entry:
   - `cover`: the main photo. Add `"fit": "contain"` for wide designs with their own typography, or `"crop": [x0, y0, x1, y1]` to cut a part of it. For a video, use `"video"` + `"time"` (seconds) to pick the frame.
   - `gallery`: the big visuals on the project page, in order, each with a `caption`. PDF pages are rendered sharp; videos are converted for the web.
3. **Run** `npm run import-projects`. This writes the images and videos into `public/projects/<slug>/`. It needs Python with `pymupdf` for PDFs.
4. **Add the text** to `PROJECTS` in `src/data/projects.ts` (same `slug`): title, tagline, description, color, icon, tech, links and `jukeExpression`. Set `coverTitle: false` when the artwork already shows the project name.

1–12 projects fit on the shelf, and the layout adapts. If an image is missing, a colorful placeholder is drawn instead.
