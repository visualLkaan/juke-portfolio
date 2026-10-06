// World layout shared by the camera, the background photo and Juke.
// The camera looks straight down -Z (no tilt) so its horizon matches the photo's,
// whose vanishing point sits at the vertical centre of the image.

export const PHOTO = {
  url: '/bg/room.jpg',
  width: 1690,
  height: 931,
  get aspect() {
    return this.width / this.height
  },
}

export const CAMERA = {
  fov: 35,
  position: [0, 0.75, 4.5] as [number, number, number],
}

// Portrait (phones): slight zoom so the camera can move down without showing the
// photo's edges. `drop` must stay below (1 - 1/zoom) × half the photo plane height.
export const PORTRAIT = { zoom: 1.12, drop: 0.3 }

// Distance from the camera to the background plane. Anything placed in front of it
// is drawn over the photo.
export const BG_DISTANCE = 14

// Juke's feet stand at y = 0 (the rug).
export const JUKE = {
  position: [-0.42, 0, 1.3] as [number, number, number],
  rotationY: 0.18,
  scale: 0.8,
}
