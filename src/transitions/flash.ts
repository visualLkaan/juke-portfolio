// The full-screen flash between the room and a project page (a plain div in Home).
let el: HTMLDivElement | null = null
export const setFlashElement = (div: HTMLDivElement | null) => {
  el = div
}
export const flashElement = () => el
