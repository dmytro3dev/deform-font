# Deform-ready 3D font

Roboto Slab Bold as clean quad meshes that can be twisted and bent without breaking.
The demo compares it side by side with a standard extruded 3D font.

A standard extrude has caps made of long triangles with nothing inside the letter, so
deformation folds them into flat facets. Here every glyph is an all-quad mesh subdivided
with Catmull-Clark, so it stays smooth.

The site also offers the font as a ZIP: a `.blend` for Blender and the web data for three.js.

## Run

```bash
npm install
npm run dev
```

Stack: Vite, TypeScript, React Three Fiber, three.js.

## License

Roboto Slab © 2018 The Roboto Slab Project Authors, Apache License 2.0. The 3D meshes are a
modified version by dmytro3dev under the same license. See `public/fonts/LICENSE.txt` and
`public/fonts/NOTICE.txt`.

## Credits

dmytro3dev · [dmytro3dev.com](https://dmytro3dev.com) · hello@dmytro3dev.com

Developed with Claude Opus 5.5.
