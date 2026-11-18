# Excavation

An excavation to walk in: two monumental chambers (a hall of about 120 by 80 m, a dome of 90 m) and three small cells, joined by tunnels of 8 m that meet the chambers at the level of their floor, with a walkway on the floor and lights set in the floor, aimed up the walls.

```bash
npm run example:excavation
```

Then open `http://127.0.0.1:5195/`.

## How it is made

`scripts/build-excavation.ts` builds the excavation offline, since it takes about fifteen seconds:

1. `growChamber` of `@spacexr/ceiling` (terrain-core) grows one closed surface around the chambers, as solids, and the tunnels, as paths, with a clearance of 4 m. The surface starts as a sphere in the hall and keeps that topology: where two of its fronts meet, round the mouth of a tunnel or where the loop of tunnels closes, they stop face to face and leave a thin sheet of rock across the void.
2. `fuseByTexels` of the same package takes those sheets away: round each place where fronts met, it rebuilds the surface on a grid of texels of 1 m, where two fronts that reach the same point are one vertex, and sews it back in. The surface then has one hole through it, the loop of tunnels. The script prints the faces of such sheets before and after: about 1 060 faces and 1 000 m² before, none left by the fusion. `--fuse none` leaves the sheets, to see them.
3. `buildRockFace` refines the surface where its edges are longer than 3.2 m and moves it into the rock by its field of erosion, fissures, ledges and faults, at a tenth of the scale of the pit it was tuned on, within 2 m. Where the rock is thin, as the wedge between a tunnel and the chamber it opens into, each move is cut to a share of the room ahead of it: the two faces of the wedge, each moving into it, passed each other and showed as dark blades across the mouths of the tunnels. The script counts the faces that go through each other: 293 pairs before that limit, none with it.
4. The walkways run through the chambers and along the tunnels, a point every metre on the ground. Each point is laid on the highest rock across the width of the walkway, looked for just over the point before, so that it climbs at most 1.2 m a metre; then smoothed over 7 m.
5. A floor light every 22 m, on one side of the walkway then the other, is aimed at the nearest steep wall on its side and up it. Around each monumental chamber, a ring of floor lights at the foot of the wall, one every 35 m or so, washes it upwards. Each light gets its cone, which covers some 16 m of wall at the point it aims at, and its range, where its light ends: the farthest rock it sees in that cone, looked for along 25 rays, and three tenths more. The ranges go from 18 to 148 m.
6. The triangles are grouped by chamber, each with the tunnels nearest to it: one group a chamber, the future tiles a viewer loads as it needs them.

It writes `public/excavation/` (about 63 000 triangles, 1.5 MB, not tracked by git). `npm run dev` builds it when it is missing; `npm run excavation` builds it again after a change of the layout. It reads the build of the sibling terrain-core: run `npm run build` in `terrain-core/packages/ceiling` first.

The page draws the rock with `createRockFaceMaterial` of `@spacexr/babylon-underground`, which adds per pixel the relief under the wavelength the mesh carries. Each floor light is a spot whose power grows with the square of the distance to the point it aims at, so that every wall it lights gets about the same light. A material takes a few lights at once: the rock and the walkways are cut into blocks of 24 m, each lit by every floor light that reaches it, seven at most here (a material takes eight), and a light on everything. So that a light reaches only so far, the rock and the walkways are drawn with the light falloff of glTF: a light ends, softly, at the edge of its cone and at its range. By the default of the PBR material of Babylon.js a light goes on for ever, as the inverse of the square of the distance and in a cone without an edge: each block was lit by the five beams nearest to it, and where a sixth still gave light, on the roofs of the monumental chambers above all, the side of the block showed as a jagged edge of light. The shaders of all the blocks are compiled as the page loads: one differs by the number of its lights, and a block that came into view later stayed black while its shader was compiled. That light is faint at first, enough to see where one walks between two floor lights; L makes it bright, which shows the rock of the whole excavation, grey under it, then takes it away, which leaves the floor lights alone.

Walking follows the ground: the eyes stay 1.7 m over whatever is under them, walkway or rock, climbing a step at once and falling down one. Only the upper body, from 0.9 m to 1.7 m, meets the walls, so one steps off the walkway and back on it.

One goes at 12 m/s, three times as fast running and three times again flying: the excavation is 450 m across, and at the pace of a walk crossing it took minutes. The speed shows at the foot of the page.

## Keys

| Key                | Does                                       |
| ------------------ | ------------------------------------------ |
| W, A, S, D, arrows | walk, on the walkway and the rock          |
| drag               | look around                                |
| Shift              | run, three times as fast                   |
| + and -            | go half as fast again, or a third slower   |
| F                  | fly, through the rock, three times as fast |
| M                  | relief per pixel off and on                |
| L                  | light on everything: faint, bright, none   |

`?octaves=4` draws fewer octaves of relief per pixel, as a mobile headset will need. `?speed=20` sets the speed on foot, in metres a second, from 1 to 120.

## In a headset

Where the browser has an immersive session to give, the page offers the headset by itself: a button enters the scene in it. Nothing is added to the address; `?xr` asks for the headset all the same. Nothing of this is written here: the page calls `offerHeadset` of the examples of spatial-display (`spatial-display/examples/xr.ts`) with the walkways as its ground, and its server takes what those examples share (`examples/vite.base.ts`). The sibling checkout of spatial-display has to be there.

The viewer stands on the walkway and goes where they point on it; the second button of a controller, B or Y, leaves the scene. The page leaves by itself when it draws fewer than 45 images a second for a few seconds; `?xr=stay` keeps it in, to look at what is slow.

A headset lets a page in only over https. Served this way, the page is given to the whole network, with the certificate made for the examples of spatial-display (`spatial-display/examples/.cert`, see its README), and it tells the terminal what happens in the headset, a line each time, marked `[headset]`:

```bash
npm run example:excavation:headset
```

The headset, on the same network, opens `https://<address of this computer>:5195/`; its browser warns about the certificate once.

The relief per pixel is nearly all of what an image costs, a noise for each octave and two more for the grain. The page reads that noise from a 3D texture it was baked into (`createRockNoiseTexture` of `@spacexr/babylon-underground`), one read a noise: the same rock on a screen and in a headset. `?noise=computed` computes it in the shader instead, eight hashes a noise, and a page with `?xr` then draws two octaves and no grain. Timed on a computer at 13 million pixels an image, from the west cell: 32 ms computed with seven octaves and the grain, 25 with four, 15 with two and no grain; 19 ms baked with seven octaves and the grain; the same view in one flat colour takes 8, and the lights and the PBR material add 2. `?octaves=` sets the octaves in both cases.

What the page adds to the helper: it asks the browser whether an immersive session is on offer and, where one is, gives the address the `?xr` the helper looks for; the walkways as one mesh that is not drawn, its origin under its lowest point (Babylon.js lets one point straight at a floor only when the origin of the floor is under the eyes, and heights are negative here); and, as the headset is entered, the viewer set at the height of the walkway under the camera of the page: Babylon.js sets them at the height 0, which it takes for the ground, and the walkway is far under it. Once in the headset, the page asks for the most foveation, fewer pixels at the edges of the lenses, and for 72 images a second where the headset offers them. In a headset as on a screen, the near blocks are drawn first, so that the far ones behind them are not shaded for nothing.

## Not done yet

Loading the chambers as tiles as the viewer moves. In a headset, the user tried it on a Quest 3, and the terminal told the rest. A first try set the viewer some 135 m over the excavation, at the height 0: corrected. A second one, in the west cell with 3360 by 1760 pixels for the two eyes, drew 42 to 46 images a second where the headset asked for 90, and the page left by itself after ten seconds. With the foveation, the 72 images a second and the order of the blocks, and still four octaves and the grain, a third try of two minutes drew 70 to 72 images a second, then 48 to 64 for its last twelve seconds, where is not known; the user found it very smooth. A fourth one with eight octaves computed and no grain drew 53 to 65 images a second, fell to 39, and the page left by itself after forty seconds. With the baked noise, seven octaves and the grain, a fifth try of two minutes and a quarter drew 54 to 72 images a second, around 60 for its first half minute and 64 to 72 after it, and the page did not leave. Offering the headset without `?xr` came after it and was not tried in the headset yet. Checked on a computer: with `?xr` the helper of spatial-display is given the walkways as its floor; the step by which Babylon.js sets the viewer as the headset is entered, run by hand, leaves them at the height of the walkway under the camera of the page; the server of `--mode headset` answers over https and writes to its terminal what it is told.

Checked in a browser on WebGL 2. By eye: the rock, the walkways, the lights, the places where the fronts of the surface had met, the ten mouths of the tunnels under the bright light, the three levels of that light, and the walls and the roof of the dome and of the hall, where no side of a block shows any more. Measured, one run on one machine, with images drawn by hand since the page was hidden and with the move of the W key put in by the script: 12.0 m/s over 47 m of the west tunnel and 36.1 m/s running over 121 m, as the page says, the eyes 1.64 to 1.74 m over the walkway all along. Keys pressed by a person, and the cadence of the images, were not measured.
