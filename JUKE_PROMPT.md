# Juke Portfolio — Claude Code Prompt

> Files already in this project folder:
> - `public/models/juke.glb` → split, named and pivoted character model (ready)
> - `public/bg/room.jpg` → background photo
> - `public/bg/depth.png` → depth map
> - `public/bg/mask_sun.png`, `mask_lamp.png`, `mask_fishbowl.png`, `mask_pennant.png` → black/white effect masks
> - `public/projects/` → project images (empty for now, will be filled later)
> - `references/` → visual reference (not part of the site, design guide only):
>   - `dvd_design_sheet.webp` → DVD case front, spine, back, disc and stack designs

---

## PROMPT

We are building a portfolio website. The home screen shows a photo-background kid's room with a living 3D character called **Juke**, whose head is a boombox. Next to him, DVDs float gently in mid-air. Each DVD is one of my projects. When a DVD is clicked, Juke takes it and inserts it into his cassette slot, the camera pushes into the cassette window and the project page opens. Juke must **never be still**. He should feel cute, playful and genuinely alive.

We will build this **in stages**. At the end of each stage: stop, take a browser screenshot and check the result yourself, give me a short summary, and wait for my approval. Do not move on to the next stage on your own.

### Tech stack
- Vite + React + TypeScript
- `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`
- Animation: GSAP (for timeline-based sequences) + procedural motion inside `useFrame`
- State: `zustand`
- Project data: `src/data/projects.ts` (title, tagline, cover image, color, tech, links, **Juke's expression for that project**)

**For the DVD design, look at `references/dvd_design_sheet.webp`.** This image is a guide for the DVDs only, not for the character or the room. Don't copy it 1:1; capture the same style.

### What you need to know about the model (`public/models/juke.glb`)
The model was generated with Meshy AI and then split into named parts. It has a single material (`juke_mat`, PBR: base color, metallic-roughness and normal textures). About 1,100 triangles total. Units: the character is **1 unit tall** (y: -0.5 → 0.5). Front faces **+Z**. `_L` = screen left (-X), `_R` = screen right (+X).

The hierarchy and pivots are **already set up correctly**:

```
Juke (root)
├─ head            pivot: neck (bottom centre of the box) → head tilt/shake from here
│  ├─ speaker_L    pivot: speaker centre → └─ speaker_L_cap (centre cap)
│  ├─ speaker_R    pivot: speaker centre → └─ speaker_R_cap
│  ├─ button_1..4  pivot: button centre (1,2,3,4 left to right) → press = move ~0.015 along -Y
│  ├─ handle       pivot: bottom centre of the handle (hinge) → └─ handle_grip
│  └─ cassette_door  pivot: BOTTOM-FRONT edge of the door (hinge). positive rotation.x ≈ 1.2 rad → door opens forward
│        ├─ cassette_eye_L
│        └─ cassette_eye_R   (small eye marks on the cassette)
├─ torso           pivot: bottom centre of the shirt
├─ hand_L, hand_R  pivot: hand centre. NO ARMS — hands float like Rayman
├─ leg_L, leg_R    pivot: hip (top of the leg)
│  └─ shoe_L / shoe_R → └─ shoe_L_tip / shoe_R_tip
```

Important notes:
- The speaker texture has **baked-in eyes**. Cover them with a circular **eye plate** in front of each speaker (just in front of the cap, ~0.003 forward). Compute the plate size and position from the speaker's bounding box — don't hardcode numbers.
- If there is no cavity behind the cassette door when it opens, add a dark "cassette slot" box behind it.
- The model is low-poly. Smooth normals with `computeVertexNormals` if needed, but keep the box edges crisp.
- Textures are ~4.7 MB. In the build step, use `@gltf-transform/cli` to downscale textures to 1024 px WebP and apply Draco compression. Target size: under 1.5 MB.

---

### STAGE 1 — Scene skeleton and loading Juke
1. Set up the project. Full-screen `<Canvas>`, a fixed camera (slightly low angle, ~35° FOV). Juke stands slightly left of centre.
2. Convert the model into a `Juke.tsx` component with `gltfjsx`. Every part must be accessible via `ref`.
3. Look: keep the model's texture but give it a **cartoon feel**. Use a subtle toon light ramp (3–4 steps), a thin black outline (inverted hull or drei `<Outlines>`) and a soft rim light.
4. **Put the background in now:** place `public/bg/room.jpg` behind everything, flat, no effects yet. Put Juke on the rug in front of the bunk bed, at a size that matches the room's scale. Build the character's lighting and shadow for this room from the start (details in Stage 7, item 9 — set up the lights now). Effects come in Stage 7.
5. **Lighting and shading:** warm orange key light from the front-left, cool greenish fill light, and a thin orange rim light from behind. A soft contact shadow under Juke plus a shadow stretching to the back-right. Slight specular highlights on the boombox edges, but it must not look like cheap plastic.
6. During development, let me tweak pivots, lights and colors live with Leva.

### STAGE 2 — Face and expression system
He has no mouth. **All emotion is told through the eyes, brows and body language.**

1. **Eye plates:** a circle in front of each speaker using a `CanvasTexture`. Draw the eyes with canvas 2D every frame (or whenever they change). Style like The Amazing World of Gumball: bold black lines, flat colors.
2. **Eye parameters** (every expression is a combination of these): `openness` (0–1, eyelid), `pupilX/pupilY` (gaze), `pupilScale`, `shape` ('normal' | 'happyArc' `^ ^` | 'heart' | 'star' | 'spiral' | 'x' | 'line'), `browAngle` and `browHeight`.
3. **Floating brows:** thin black curves above the eye plates, attached to the head. Essential for angry, sad and surprised expressions.
4. **Cassette eyes** (`cassette_eye_L/R`): a second, tiny face. It should support the main expression (scaling, bouncing).
5. **Expressions** (at least): `neutral`, `happy`, `excited`, `surprised`, `sleepy`, `suspicious`, `love`, `dizzy`, `proud`, `shy` (pink blush on the cheeks), `thinking`, `wink`, `focused`.
6. Transitions between expressions must be **smooth**: parameters lerp, no hard jumps. Blinks, however, are fast (~120 ms).
7. **Blinking:** randomly every 2–6 seconds. Occasionally a double blink.
8. **Mouse tracking:** pupils follow the cursor, and the head turns slightly toward it (max ~10°). If the mouse doesn't move for a while, he looks around.

### STAGE 3 — Aliveness (idle behaviour)
Juke must **never** be completely still.

**Continuous layer** (always running, `useFrame`):
- Breathing: `torso` y-scale ±2%. The head rises and falls slightly with the breath.
- Hands float gently in the air (sine waves, different phases).
- Speakers do a rhythmic "bass thump" to the music: slight scaling at ~100 BPM. The caps (`*_cap`) move a bit more.
- `handle` sways very slightly.
- Weight shift: hips sway gently left and right.

**Random behaviours** (every 8–20 seconds, never the same one twice in a row):
- A small dance with head bobbing (foot tapping, hands keeping the beat)
- Looking around (`suspicious` → `neutral`)
- Yawning, then `sleepy` (after 60 seconds without interaction he dozes off with floating Z's; moving the mouse startles him awake)
- Pressing one of his own buttons and changing expression
- Making the handle go "boing"
- Waving at the screen
- Looking at a nearby DVD with a `thinking` expression

**Particles:** music notes from the speakers while dancing, hearts for `love`, a sweat drop when shy. drei `<Sparkles>` or simple sprites are enough.

### STAGE 4 — Interactions
- **Buttons 1–4:** on click the button presses in (GSAP, springy return), a "click" sound plays, and each button triggers something different:
  - 1 → random happy expression + music-note particles
  - 2 → short dance
  - 3 → `dizzy` (spiral eyes, head spins)
  - 4 → `love` + hearts
- **Clicking a speaker:** blink and a "hey!" reaction (`surprised` → `happy`)
- **Clicking the head:** head wobbles, brows raise
- **Clicking the handle:** handle goes "boing"
- **Clicking the hands:** high-five animation
- **5 rapid clicks in a row:** `dizzy` + an annoyed reaction (angry brows), then he forgives you. A small hidden easter egg.
- When hovering Juke, the cursor becomes `pointer` and Juke looks at the cursor.
- Sounds are optional, with a sound on/off toggle in the bottom-right corner. Default: off.

### STAGE 5 — Floating DVDs
**Design reference: `references/dvd_design_sheet.webp`.** The DVDs should look like this sheet.

1. **DVD case** (`DvdCase.tsx`): slightly glossy black plastic case with rounded edges. Cover art under a transparent plastic layer on the front, the case's hinge ridge on the left, and thin horizontal lines along the bottom edge. Every face should match the reference:
   - **Front cover:** colored frame (the project's color). At the top, the project name in a big, bold, playful font (like "SPACE DOGS" and "PIZZA PLANET" in the reference; a Google Font such as "Lilita One" or "Bagel Fat One"). In the middle, the **project thumbnail**. At the bottom, on a colored band: a small icon badge in the left corner, a 2-line tagline next to it, and a small "DVD" logo bottom-right.
   - **Spine:** vertical project name, small icon (emoji) at the top, "DVD" logo at the bottom, in the project's color.
   - **Back:** project name, short description paragraph, 2–3 small screenshots (if available), barcode.
   - **Disc:** print generated from the cover art, transparent ring around the centre hole, iridescent rainbow sheen on the rim.
   - **Inside:** when the case opens, an empty inner cover on the left and the disc on the right.
2. **Covers must be generated entirely from data.** Draw every face with canvas (`coverTexture.ts`). I will only add data to `projects.ts` and images to `public/projects/`; the cover builds itself. I should never have to design a cover by hand.
3. **Project data isn't ready yet.** For now, put **6 sample projects** in `projects.ts` using the names from the reference: Space Dogs, Pizza Planet, Monster Camp, Bubble Trip, Ocean Boy, Night Race. Give each a different color, emoji and Juke expression. Instead of thumbnails, draw a simple, colorful **placeholder illustration** with canvas. I'll replace these with my real projects later. Use this data shape:
   ```ts
   {
     slug: 'space-dogs',
     title: 'Space Dogs',
     tagline: 'One short sentence',       // the 2 lines on the cover
     description: 'Long description',     // back cover and project page
     thumbnail: '/projects/space-dogs/thumb.jpg',   // placeholder is drawn if missing
     screenshots: ['/projects/space-dogs/1.jpg'],   // optional
     color: '#5b3fd1',
     icon: '🪐',
     tech: ['React', 'Three.js'],
     links: { live: '', github: '' },
     jukeExpression: 'love',
   }
   ```
   - If a thumbnail is missing or fails to load, **don't throw** — show the placeholder.
   - If a long project name doesn't fit on the cover, shrink the font automatically or wrap it to two lines.
   - The number of projects can be anywhere from 1 to 12. The layout must adapt.
   - Add `public/projects/README.md` explaining in 3–4 steps how to add a new project (recommended thumbnail size: 800×800).
4. The DVDs sit to Juke's right in a loose, slightly scattered arc. They float **in place** with drei `<Float>`: gentle up/down and slight rotation, each in a different phase.
5. **Hover:** the DVD comes forward, grows slightly, its edge glows, and the disc slides partly out of the case showing its rainbow sheen (iridescence material). Juke looks at it and makes a light version of that project's expression.
6. On mobile, the DVDs become a horizontally scrollable row at the bottom of the screen.

### STAGE 6 — Selecting a DVD and the transition (the key moment)
When a DVD is clicked, play this sequence with a GSAP timeline (~2.5 s total):
1. Juke makes the project's expression (`jukeExpression` from `projects.ts`).
2. The DVD flies toward Juke. He catches it with one hand.
3. `cassette_door` opens (rotation.x 0 → ~1.2, with a slight bounce).
4. The disc comes out of the case and spins into the cassette slot. The case disappears.
5. The door closes. The speakers do one strong "bass thump", eyes go `excited`.
6. The camera pushes into the cassette window (dolly + slight FOV narrowing). The window fills the screen.
7. A white/colored flash from the cassette window → the **project page** opens (`/project/:slug`, React Router). The page should feel like a "tape deck / DVD player screen".
8. **Going back:** an "⏏ Eject" button. The animation plays in reverse: the camera pulls back, the door opens, the DVD comes out and floats back to its spot, and Juke waves.
- Lock other clicks during the transition.
- If the project page is opened directly by URL, open it without the animation.

**Project page content** (from `projects.ts`): large cover image, project name, long description, screenshot gallery, tech used (as badges), live site and GitHub links. Same color and font as the DVD cover. A small Juke icon sits in a corner of the page and his eyes move as the page scrolls.

### STAGE 7 — Making the background photo "alive"
The background `public/bg/room.jpg` stays a photo, but it must not feel like a static photo. The photo: a kid's room at sunset. Bunk bed in the middle, white door and chest of drawers on the right, cabinet, desk lamp and a paper-lantern ceiling light on the left. The window is out of frame, to the left. Orange sun patches fall on the walls, the door and the rug, and inside those patches are **shadows of the window frame and tree leaves**.

Files to use (all in `public/bg/`; in the masks white = effect area, black = leave alone):
- `depth.png` → depth map (lighter = closer)
- `mask_sun.png` → all sunlit patches
- `mask_lamp.png` → the paper-lantern ceiling light (and the desk lamp bulb)
- `mask_fishbowl.png` → the fishbowl on the cabinet
- `mask_pennant.png` → the pennants on the left edge

Effects:
1. **Depth parallax:** put the photo on a full-screen plane with a custom shader. Use `depth.png` for a very subtle 2.5D shift following the mouse (gyroscope on mobile). Scale the photo up 5% so no gaps show at the edges. The depth map was made with Depth Anything V2 (8-bit, lighter = closer). To avoid tearing at object edges, slightly smooth the depth in the shader and keep the offset small (max ~1.5% of UV). The foreground left wall and the chest of drawers on the right should move most, the back wall least.
2. **Leaf shadows in the wind (main effect):** inside `mask_sun.png`, generate a procedural noise leaf-shadow pattern and sway it slowly. Also add a UV distortion that gently shifts the existing shadows. It should look like a tree outside is moving in the wind. Keep it subtle — don't overdo it.
3. **Breathing sunlight:** the brightness of the `mask_sun.png` area rises and falls 5–10% on a 10–20 second cycle. Occasionally a brief dimming, as if a cloud passes.
4. **Light shafts and dust:** very transparent volumetric light shafts slanting down from the left (from the off-screen window) to the right. Dust particles drift slowly inside the shafts; they glow while inside a shaft and fade out when they leave it.
5. **Ceiling light:** a very subtle warm glow (bloom) in the `mask_lamp.png` area and a very slow, slight sway (via UV shift).
6. **Fishbowl:** a gentle ripple and shimmer inside `mask_fishbowl.png`, imitating water refraction.
7. **Pennants:** a gentle flutter in the wind inside `mask_pennant.png`.
8. **Atmosphere:** very light film grain, vignette, warm color grade.
9. **Grounding Juke in the photo:** Juke stands on the rug in front of the bunk bed. The key light is warm orange sunset light from the front-left (around #ffb35c). The fill light is a cool greenish tone bounced from the wall color. His shadow falls to the back-right, in the same direction as the other shadows on the rug (`ShadowMaterial` plane + `<ContactShadows>`). Leaf shadows should also pass lightly over Juke, so he feels like he's under the same light. Juke **must not look pasted on top of the photo**.
- Light the DVDs with the same light and color tone.
- If a mask file is missing, skip that effect and tell me which mask is missing.

### STAGE 7.5 — Interaction between Juke, the room and the DVDs
Goal: Juke, the room and the DVDs should be **aware of each other**. Everything in the scene should feel like it reacts to everything else. All events go through one shared event system (`zustand` or a simple event bus).

**Juke reacts to the room:**
- When a cloud passes and the sun dims, Juke looks left toward the window. When the sun comes back, he squints.
- A dust particle lands on Juke's head → he sneezes (whole body jolts, the handle bounces). Nearby DVDs wobble from the jolt. This should be rare.
- When the ceiling light sways, he occasionally looks up and follows it with his eyes.
- When the mouse hovers an object in the room (lamp, fishbowl, door, skateboard, etc.), Juke looks at that spot.

**The room is clickable** (by sampling the masks at the clicked point):
- **Lamp:** sways more, Juke follows it with his eyes and gets `dizzy`.
- **Fishbowl:** the water ripples, Juke looks curious (`surprised` → `happy`).
- **Pennants:** flutter in a gust, Juke shivers as if cold.
- **Sun patch:** the leaf shadows speed up for a moment at the clicked spot, as if a gust of wind blew. Dust particles scatter.

**Juke and the DVDs:**
- When Juke dances, the DVDs bob to the beat.
- On a strong speaker bass thump, nearby DVDs get pushed by a small shockwave and drift back. Dust in the light shafts gets blown around too.
- While Juke dozes, the DVDs float more slowly. When he wakes up, they all "flinch" at once.
- When idle, Juke occasionally reaches toward a nearby DVD: he pokes it to make it spin, or straightens a crooked one, then looks pleased.
- The DVDs lean very slightly toward Juke, as if they're looking at him.
- If you sweep quickly across the DVDs, Juke's eyes dart from one DVD to the next. If you hover one for a long time, he gets excited.

### STAGE 8 — Polish and performance
- Intro: a short loading screen. Juke wakes up, stretches and waves.
- If `prefers-reduced-motion` is on, reduce animations.
- Mobile: DPR max 1.5, light post-processing, half the particle count.
- Target: 60 fps on desktop, 30+ fps on a mid-range phone. Lighthouse performance score 85+.
- Keyboard access: DVDs reachable with Tab and selectable with Enter. Every DVD has an aria label.
- Put all expression, behaviour and timing settings in a single `src/juke/config.ts` file so I can easily tweak them later.

### Code structure
```
src/
  juke/        Juke.tsx, EyePlate.tsx, Brows.tsx, expressions.ts, behaviors.ts, config.ts, useJukeStore.ts
  dvd/         DvdCase.tsx, DvdShelf.tsx, coverTexture.ts
  scene/       Background.tsx (parallax + effect shaders), Lights.tsx, Effects.tsx, RoomHotspots.tsx (mask-based clicks)
  events/      sceneEvents.ts (shared event system between Juke, the room and the DVDs)
  transitions/ insertDvd.ts (GSAP timeline)
  pages/       Home.tsx, Project.tsx
  data/        projects.ts
```

**Start with Stage 1 now.** You can talk to me in Turkish.
