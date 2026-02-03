export const SKILLS: Record<string, string> = {
  "advanced-sdf": `KEY RULES: sdfFn(x,y,z)→number, colorFn(x,y,z)→[r,g,b]. Three separate number args, NOT arrays. Always return. Pad bMin/bMax 20%+. Dimension args = constants only.

# Advanced SDF Techniques

## Positioning Reminder
To place a shape at world (wx, wy, wz): pass (x-wx, y-wy, z-wz) as the query point.
WRONG: sdSphere(wx, wy, wz, r) — this is a fixed point, not a distance field
RIGHT: sdSphere(x-wx, y-wy, z-wz, r) — evaluates distance from every query point

## Domain Techniques

Mirror/Symmetry — model one side, both render:
  var mx = domainMirror(lx);  // reflects across YZ plane
  // Use mx instead of lx in SDF calls. Combine axes for 2/4/8-fold symmetry.

Infinite Repetition — tile space along an axis:
  var repX = domainRepeat(lx, spacing);
  // Use repX instead of lx. Produces infinite copies spaced evenly.

Limited Repetition — clamp to N copies per side:
  var repX = lx - spacing * Math.max(-N, Math.min(N, Math.round(lx/spacing)));

Instance ID for per-copy variation:
  var id = Math.round(lx/spacing);
  var variation = noise2D(id * 100, 0); // unique per instance

Twist — rotate XZ proportional to Y:
  var tw = domainTwist(lx, ly, lz, k);
  var rx = tw[0], rz = tw[1];
  // Use (rx, ly, rz) instead of (lx, ly, lz). k = twist rate.

Bend — rotate XY proportional to X:
  var bn = domainBend(lx, ly, k);
  var bx = bn[0], by = bn[1];

Elongation — stretch shape along axis while preserving ends:
  var ex = Math.max(Math.abs(lx) - h, 0) * (lx > 0 ? 1 : -1);
  // Use ex instead of lx. Stretches by 2h along X.

Uniform Scale:
  return sdfFn(lx/s, ly/s, lz/s) * s;

## Shell / Onion
Turn any solid into a thin shell: var d = opShell(solidSDF, thickness);
Stack for concentric layers: opOnion(opOnion(d, t1), t2)

## SDF-Based Ambient Occlusion (in colorFn)
Darken crevices by sampling the SDF along the surface normal:
  var eps = 0.01;
  var nx = sdfFn(x+eps,y,z)-sdfFn(x-eps,y,z);
  var ny = sdfFn(x,y+eps,z)-sdfFn(x,y-eps,z);
  var nz = sdfFn(x,y,z+eps)-sdfFn(x,y,z-eps);
  var nl = Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=nl; ny/=nl; nz/=nl;
  var ao = 0;
  for (var i=1;i<=5;i++) { var h=0.02*i; ao += (h-sdfFn(x+nx*h,y+ny*h,z+nz*h))/Math.pow(2,i); }
  ao = 1 - Math.max(0, Math.min(1, ao*5));
  // Multiply final color by ao

## Common Mistakes in Advanced SDF
WRONG: domainTwist(x, y, z, k) then using x,z directly
RIGHT: var tw = domainTwist(lx, ly, lz, k); use tw[0] and tw[1] as replacement for lx,lz

WRONG: opShell(sdSphere(x,y,z, r), t) without adjusting bMin/bMax
RIGHT: Shell makes the shape larger by thickness — expand bMin/bMax by thickness amount

## Complete Example — Twisted Shell Column

\`\`\`js
// Twisted cylindrical shell at scene center
var cx = 0, cy = -1.0, cz = -3;
sdfMesh(
  function(x, y, z) {
    var lx = x - cx, ly = y - cy, lz = z - cz;
    // Twist the domain around Y axis
    var tw = domainTwist(lx, ly, lz, 2.5);
    var rx = tw[0], rz = tw[1];
    // Base cylinder: radius 0.2, half-height 0.5
    var cyl = sdCylinder(rx, ly, rz, 0.2, 0.5);
    // Hollow it out into a shell
    var shell = opShell(cyl, 0.03);
    // Add surface texture
    shell = opDisplace(shell, noise3D(x * 15, y * 15, z * 15) * 0.008);
    return shell;
  },
  function(x, y, z) {
    var ly = y - cy;
    // Height-based gradient: warm at bottom, cool at top
    var t = (ly + 0.5) / 1.0;
    var n = noise3D(x * 8, y * 8, z * 8) * 0.06;
    return [0.7 - t * 0.3 + n, 0.3 + t * 0.2 + n, 0.2 + t * 0.4 + n];
  },
  [cx - 0.4, cy - 0.65, cz - 0.4], [cx + 0.4, cy + 0.65, cz + 0.4], 100
);
\`\`\``,

  "natural-world": `KEY RULES: sdfFn(x,y,z)→number, colorFn(x,y,z)→[r,g,b]. Three separate number args, NOT arrays. Always return. Pad bMin/bMax 20%+. Dimension args = constants only.

# Natural World

## Organic Shape Construction
The key to realism: multi-scale detail and irregularity. Never use a single primitive alone.

Layer complexity for any organic shape:
1. Base form — coarse silhouette from combined primitives (opSmoothUnion, k=0.05–0.15)
2. Medium detail — opSmoothSubtract to sculpt secondary features
3. Fine detail — opDisplace with fbm3D for surface texture
4. Color — noise-driven colorFn to break uniformity

Noise displacement is critical for organic realism:
  opDisplace(d, fbm3D(x*freq, y*freq, z*freq, octaves) * amplitude)
- Low freq (2–4) + high amp (0.1–0.2): large-scale shape irregularity
- High freq (8–15) + low amp (0.02–0.06): bark, skin, leaf roughness
- Stack both: opDisplace(opDisplace(d, lowFreq), highFreq)

## Scattering & Placement

Random scatter with rejection:
  for (var i = 0; i < N; i++) {
    var tx = minX + random()*(maxX-minX);
    var tz = minZ + random()*(maxZ-minZ);
    var scale = 0.5 + random()*0.5;
    // Position each instance at (tx, groundY, tz) with per-instance variation
  }

Poisson Disk (minimum-distance scatter for natural look):
  var pts=[]; for(var i=0;i<N*10&&pts.length<N;i++){
    var x=minX+random()*(maxX-minX), z=minZ+random()*(maxZ-minZ);
    var ok=true; for(var j=0;j<pts.length;j++){var dx=x-pts[j][0],dz=z-pts[j][1];if(dx*dx+dz*dz<minDist*minDist){ok=false;break;}}
    if(ok)pts.push([x,z]);
  }

## Terrain (grid heightfields)

Rolling hills: function(x,z){ return -1.5 + fbm2D(x*0.8, z*0.8, 4) * 0.5; }

Ridged mountains:
  function(x,z) {
    var sum=0,amp=1,freq=0.5,weight=1;
    for(var i=0;i<6;i++){var n=1-Math.abs(noise2D(x*freq,z*freq)); n=n*n*weight; weight=Math.min(1,Math.max(0,n*2)); sum+=n*amp; amp*=0.5; freq*=2;}
    return -1.0+sum*0.6;
  }

Terracing: return Math.round(fbm2D(x*0.6,z*0.6)*steps)/steps + baseY;

Island falloff:
  var dx=(x-cx)/rx, dz=(z-cz)/rz; var falloff=1-Math.min(1,dx*dx+dz*dz);
  return baseY + fbm2D(x*0.8,z*0.8)*0.6*falloff;

## Water
Still water: grid at constant y=waterLevel. Color: [0.1, 0.3, 0.6].
Waves: y = waterLevel + 0.02*Math.sin(x*3+z*2) + 0.01*Math.sin(x*5-z*3)

## Nature Color Palette
Bark: [0.35,0.22,0.10], Foliage: [0.15,0.40,0.08], Moss: [0.20,0.35,0.12]
Grass: [0.20,0.45,0.10], Rock: [0.45,0.42,0.38], Sand: [0.76,0.70,0.50]
Snow: [0.90,0.90,0.95], Deep water: [0.05,0.15,0.40], Shallow water: [0.10,0.35,0.55]

## Complete Example — Mushroom

\`\`\`js
var cx = 0, cy = -1.5, cz = -3;
sdfMesh(
  function(x, y, z) {
    var lx = x - cx, ly = y - cy, lz = z - cz;
    // Stem: cylinder, radius 0.08, half-height 0.2
    var stem = sdCylinder(lx, ly - 0.2, lz, 0.08, 0.2);
    // Cap: flattened ellipsoid on top of stem
    var cap = sdEllipsoid(lx, ly - 0.45, lz, 0.25, 0.12, 0.25);
    // Smooth blend for organic joint
    var d = opSmoothUnion(stem, cap, 0.06);
    // Surface bumps
    d = opDisplace(d, fbm3D(x * 12, y * 12, z * 12, 3) * 0.01);
    return d;
  },
  function(x, y, z) {
    var ly = y - cy;
    // Height-based: pale stem → red-brown cap
    var t = Math.max(0, Math.min(1, (ly - 0.3) / 0.2));
    var r = 0.85 * t + 0.75 * (1 - t);
    var g = 0.20 * t + 0.65 * (1 - t);
    var b = 0.12 * t + 0.55 * (1 - t);
    var n = fbm3D(x * 8, y * 8, z * 8, 3) * 0.08;
    return [Math.min(1, r + n), Math.min(1, g + n * 0.5), Math.min(1, b + n * 0.3)];
  },
  [cx - 0.4, cy - 0.1, cz - 0.4], [cx + 0.4, cy + 0.7, cz + 0.4], 90
);
\`\`\`

## Complete Example — Terrain with Biome Colors

\`\`\`js
// Rolling terrain with grass/rock coloring based on height and slope
grid(-3, -6, 3, 0, 150, 150,
  function(x, z) {
    return -1.5 + fbm2D(x * 0.6, z * 0.6, 5) * 0.6;
  },
  function(x, z) {
    var eps = 0.05;
    var h = -1.5 + fbm2D(x * 0.6, z * 0.6, 5) * 0.6;
    // Approximate slope from height differences
    var hx = -1.5 + fbm2D((x+eps) * 0.6, z * 0.6, 5) * 0.6;
    var hz = -1.5 + fbm2D(x * 0.6, (z+eps) * 0.6, 5) * 0.6;
    var slope = Math.sqrt((hx-h)*(hx-h) + (hz-h)*(hz-h)) / eps;
    var n = noise2D(x * 5, z * 5) * 0.04;
    // Steep = rock, flat = grass
    if (slope > 0.4) return [0.45 + n, 0.42 + n, 0.38 + n];
    if (h > -1.0) return [0.4 + n, 0.40 + n, 0.35 + n];
    return [0.20 + n, 0.45 + n, 0.10 + n];
  }
);
\`\`\``,

  "materials-and-color": `KEY RULES: sdfFn(x,y,z)→number, colorFn(x,y,z)→[r,g,b]. Three separate number args, NOT arrays. Always return. Pad bMin/bMax 20%+. Dimension args = constants only.

# Materials & Color

## Material RGB Reference (values 0–1)

Wood: oak [0.55,0.35,0.17], pine [0.65,0.50,0.30], walnut [0.30,0.18,0.10], birch [0.75,0.65,0.50], mahogany [0.45,0.22,0.12], cherry [0.60,0.30,0.15]
Stone: granite [0.55,0.52,0.50], sandstone [0.72,0.62,0.45], slate [0.35,0.38,0.40], marble [0.90,0.88,0.85], basalt [0.25,0.25,0.28]
Metal: iron [0.42,0.40,0.38], copper [0.72,0.45,0.20], gold [0.83,0.69,0.22], bronze [0.55,0.45,0.25], silver [0.75,0.75,0.78], rust [0.55,0.25,0.10]
Earth: dry soil [0.45,0.35,0.22], wet soil [0.25,0.18,0.10], sand [0.76,0.70,0.50], clay [0.60,0.42,0.30]
Vegetation: fresh leaf [0.18,0.42,0.10], moss [0.20,0.35,0.12], bark [0.35,0.22,0.10], autumn [0.70,0.20,0.08]
Sky/Water: deep ocean [0.05,0.15,0.40], shallow [0.10,0.35,0.55], sky noon [0.53,0.81,0.92], sunset [0.95,0.55,0.25]
Skin: light [0.90,0.75,0.65], medium [0.70,0.50,0.35], dark [0.40,0.25,0.15]
Misc: bone [0.88,0.85,0.78], terracotta [0.72,0.40,0.22], brick [0.60,0.30,0.25], concrete [0.60,0.58,0.55]

## Procedural Textures (in colorFn)

Marble veins:
  var v = Math.sin(x*10 + fbm3D(x*4,y*4,z*4,4)*3) * 0.5 + 0.5;
  return [0.9-v*0.15, 0.88-v*0.15, 0.85-v*0.1];

Wood grain (concentric rings):
  var ring = Math.sin(Math.sqrt(x*x+z*z)*20 + fbm3D(x*2,y*2,z*2,3)*2) * 0.5 + 0.5;
  return [0.55+ring*0.1, 0.35+ring*0.05, 0.17-ring*0.05];

Brick pattern:
  var bx=((x/0.2)%1+1)%1, bz=((z/0.1+Math.floor(x/0.2)*0.5)%1+1)%1;
  var mortar=(bx<0.05||bx>0.95||bz<0.05||bz>0.95)?1:0;
  return mortar ? [0.7,0.7,0.65] : [0.6+noise2D(x*10,z*10)*0.08, 0.30, 0.25];

## Coloring Strategies

Height-based blending (for sdfMesh colorFn):
  function ss(a,b,t){t=(t-a)/(b-a);t=t<0?0:t>1?1:t;return t*t*(3-2*t);}
  // Use ss() to smoothly transition between materials at different heights

Multi-part coloring (different colors per SDF region):
  var dPartA = sdSphere(...); var dPartB = sdCylinder(...);
  if (dPartA < dPartB) return woodColor; else return metalColor;

ALWAYS add noise: return [baseR + noise3D(x*s,y*s,z*s)*0.05, ...] for natural imperfection.

## Weathering & Aging

Rust: var mask=fbm3D(x*8,y*8,z*8,4)*0.5+0.5; if(mask>0.6) blend toward [0.55,0.25,0.10]
Moss: var mask=fbm3D(x*6,y*6,z*6)*0.5+0.5; if(mask>0.5 && surfaceNormalY>0.5) blend toward [0.20,0.35,0.12]
Patina: blend toward [0.30,0.65,0.50] using noise mask on exposed surfaces

## Math Utilities
smoothstep: function ss(a,b,t){t=(t-a)/(b-a);t=t<0?0:t>1?1:t;return t*t*(3-2*t);}
lerp color: function lc(a,b,t){return[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];}`,

  "objects-and-characters": `KEY RULES: sdfFn(x,y,z)→number, colorFn(x,y,z)→[r,g,b]. Three separate number args, NOT arrays. Always return. Pad bMin/bMax 20%+. Dimension args = constants only.

# Objects & Characters — Construction Techniques

## Design Principles
Every object needs: (1) accurate silhouette from multiple primitives, (2) secondary features (handles, joints, textures), (3) surface detail via noise displacement, (4) high resolution (80–128).

## SDF Composition
- Start with dominant volume, add/subtract secondary features
- opSmoothUnion with k=0.02–0.08 for natural joints
- opSubtract/opSmoothSubtract for cavities and carving
- opDisplace with fbm3D for surface imperfection
- opRound to soften hard edges on manufactured objects

## Multi-Part Coloring
In colorFn, evaluate individual SDF distances to determine which "part" a point is on:
  var dWood = sdBox(lx, ly, lz, ...);
  var dMetal = sdCylinder(lx, ly-0.3, lz, ...);
  if (dWood < dMetal) return [0.55, 0.35, 0.17]; // wood
  else return [0.42, 0.40, 0.38]; // metal

## Symmetry
Mirror (bilateral — animals, vehicles):
  var mx = domainMirror(lx);  // model one side, both render

Angular repetition (petals, wheels, columns):
  var angle = Math.atan2(lz, lx);
  var repAngle = Math.PI*2/N;
  angle = ((angle % repAngle) + repAngle) % repAngle - repAngle/2;
  var localR = Math.sqrt(lx*lx + lz*lz);
  var rlx = Math.cos(angle) * localR, rlz = Math.sin(angle) * localR;

## Hollow Objects
Shell: opShell(solidSDF, wallThickness)
Cut opening: opIntersect(opShell(sdSphere(lx,ly,lz, R), 0.02), sdPlane(lx,ly,lz, 0,1,0, cutY))
For cups, bowls, vases, helmets, pipes.

## Lathe — Surface of Revolution
Ideal for rotationally symmetric objects: vases, bottles, columns, bowls, chess pieces, wine glasses.
profile = [[radius, yOffset], ...] where yOffset=0 is the BOTTOM of the shape and yOffset increases UPWARD. The shape's bottom is placed at cy. List profile points from bottom to top.
Use 10–20+ points for smooth curves. segments = 24–48.
Optional angleOffset (radians, default 0) rotates the whole shape around its axis. Use Math.PI/4 with segments=4 to align a square pyramid roof with axis-aligned box walls.

For a roof/cone/pyramid: radius is LARGE at the bottom (yOffset=0) and ZERO at the top (highest yOffset).
WRONG: [[0, 0], [0.7, 0.4]] — this makes a cone with the POINT at the bottom
RIGHT: [[0.7, 0], [0, 0.4]] — this makes a cone with the POINT at the top (like a roof)

WRONG: lathe(cx,cy,cz, profile, 4, r,g,b) on top of a box — corners at 0°/90°/180°/270° are diamond-rotated vs the box
RIGHT: lathe(cx,cy,cz, profile, 4, r,g,b, Math.PI/4) — angleOffset rotates corners to match box edges

## extrudePath — Sweep Profile Along Path
Creates tubes, rails, wires, organic tendrils. profile = [[x,y], ...] is the 2D cross-section. path = [[x,y,z], ...] is the 3D spine. closed = true wraps the profile into a loop (tube).

For a circular cross-section:
  var profile = [];
  for (var i = 0; i <= 16; i++) {
    var a = i / 16 * Math.PI * 2;
    profile.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }

## Scale Reference
Person ≈ 0.4–0.6 tall. Tree ≈ 0.5–1.0. Building ≈ 0.8–1.5. Small object ≈ 0.1–0.3.
Scene center: (0, -0.5, -3). Ground: y ≈ -1.5.

## Complete Example — Table with Wood Grain

\`\`\`js
var cx = 0, cy = -0.8, cz = -3;
sdfMesh(
  function(x, y, z) {
    var lx = x - cx, ly = y - cy, lz = z - cz;
    // Tabletop: rounded box slab
    var top = opRound(sdBox(lx, ly, lz, 0.5, 0.03, 0.3), 0.01);
    // Four legs at corners
    var leg1 = sdCylinder(lx - 0.4, ly + 0.38, lz - 0.22, 0.03, 0.35);
    var leg2 = sdCylinder(lx + 0.4, ly + 0.38, lz - 0.22, 0.03, 0.35);
    var leg3 = sdCylinder(lx - 0.4, ly + 0.38, lz + 0.22, 0.03, 0.35);
    var leg4 = sdCylinder(lx + 0.4, ly + 0.38, lz + 0.22, 0.03, 0.35);
    var legs = opUnion(opUnion(leg1, leg2), opUnion(leg3, leg4));
    return opSmoothUnion(top, legs, 0.02);
  },
  function(x, y, z) {
    var ring = Math.sin(Math.sqrt((x-cx)*(x-cx)+(z-cz)*(z-cz))*20
      + fbm3D(x*3,y*3,z*3,3)*2) * 0.5 + 0.5;
    return [0.55 + ring*0.1, 0.35 + ring*0.06, 0.17 - ring*0.04];
  },
  [cx-0.65, cy-0.85, cz-0.45], [cx+0.65, cy+0.1, cz+0.45], 90
);
\`\`\`

## Complete Example — Vase using Lathe

\`\`\`js
// Classic vase at scene center using lathe (surface of revolution)
lathe(0, -1.5, -3,
  [
    [0.00, 0.00],  // bottom center point
    [0.12, 0.01],  // base edge
    [0.14, 0.05],  // base flare
    [0.10, 0.15],  // narrowing above base
    [0.08, 0.30],  // narrow waist
    [0.09, 0.40],  // slight bulge
    [0.15, 0.55],  // widening body
    [0.20, 0.70],  // max width
    [0.18, 0.80],  // tapering toward neck
    [0.12, 0.88],  // neck
    [0.10, 0.92],  // neck narrowest
    [0.13, 0.95],  // lip flare
    [0.14, 0.97],  // lip top
    [0.12, 0.98],  // lip inner edge
    [0.00, 0.98],  // top center (closes the top)
  ],
  32, 0.72, 0.40, 0.22  // terracotta color
);
\`\`\`

## Complete Example — Helix Tube using extrudePath

\`\`\`js
// Helical tube winding upward at scene center
var profile = [];
var tubeR = 0.03;
for (var i = 0; i <= 12; i++) {
  var a = i / 12 * Math.PI * 2;
  profile.push([Math.cos(a) * tubeR, Math.sin(a) * tubeR]);
}
var path = [];
var helixR = 0.3, pitch = 0.08;
for (var t = 0; t < 150; t++) {
  var a = t / 150 * Math.PI * 8; // 4 full turns
  path.push([
    Math.cos(a) * helixR,
    -1.5 + t * pitch / 150 * 4,  // rise from ground
    Math.sin(a) * helixR - 3     // centered at z=-3
  ]);
}
extrudePath(profile, path, true, 0.72, 0.45, 0.20);
\`\`\``,

  "math-and-patterns": `KEY RULES: sdfFn(x,y,z)→number, colorFn(x,y,z)→[r,g,b]. Three separate number args, NOT arrays. Always return. Pad bMin/bMax 20%+. Dimension args = constants only.

# Mathematical Shapes & Patterns

## Implicit Surfaces (as sdfFn for sdfMesh)

Gyroid — triply periodic minimal surface:
  function(x,y,z) {
    var s = 6;
    return Math.sin(x*s)*Math.cos(y*s) + Math.sin(y*s)*Math.cos(z*s) + Math.sin(z*s)*Math.cos(x*s);
  }
  Shell version: wrap in opShell(d, 0.15). Color by position for gradient effect.

Schwarz P:
  function(x,y,z) { var s=6; return Math.cos(x*s)+Math.cos(y*s)+Math.cos(z*s); }

## Parametric Curves (via extrudePath)

Trefoil Knot:
  var path=[]; for(var t=0;t<200;t++){var a=t/200*Math.PI*2;
    path.push([(Math.sin(a)+2*Math.sin(2*a))*0.15, (Math.cos(a)-2*Math.cos(2*a))*0.15-0.5, -Math.sin(3*a)*0.15-3]);
  }
  // Pair with circular profile (radius 0.03–0.05) and extrudePath(profile, path, true, r,g,b)

General Torus Knot (p,q):
  var R=0.3, r=0.1;
  for(var t=0;t<300;t++){var a=t/300*Math.PI*2;
    path.push([(R+r*Math.cos(q*a))*Math.cos(p*a), r*Math.sin(q*a)-0.5, (R+r*Math.cos(q*a))*Math.sin(p*a)-3]);
  }

## Spirals

Helix: path with x=R*cos(t), y=pitch*t, z=R*sin(t). Use as extrudePath spine.

Logarithmic Spiral (nautilus): r = a * exp(b*theta), b ≈ 0.3063 for golden spiral.

## Voronoi / Cellular Patterns

2D Voronoi (for heightFn or colorFn):
  var seeds=[]; for(var i=0;i<N;i++) seeds.push([minX+random()*(maxX-minX), minZ+random()*(maxZ-minZ)]);
  // In function: find nearest seed distance
  var minD=1e10, minD2=1e10;
  for(var i=0;i<seeds.length;i++){var dx=x-seeds[i][0],dz=z-seeds[i][1];var d=Math.sqrt(dx*dx+dz*dz);
    if(d<minD){minD2=minD;minD=d;}else if(d<minD2){minD2=d;}}
  // F1=minD (smooth cells), F2-F1=minD2-minD (cell edges, cobblestone)

## Coordinate Transforms

Polar: var r=Math.sqrt(x*x+z*z); var theta=Math.atan2(z,x);
Spherical: var r=Math.sqrt(x*x+y*y+z*z); var phi=Math.acos(y/r); var theta=Math.atan2(z,x);

## Bezier Curves
Quadratic: function b2(t,p0,p1,p2){var u=1-t; return u*u*p0+2*u*t*p1+t*t*p2;}
Cubic: function b3(t,p0,p1,p2,p3){var u=1-t; return u*u*u*p0+3*u*u*t*p1+3*u*t*t*p2+t*t*t*p3;}

## Fractals

Menger Sponge (SDF):
  function(x,y,z) {
    var d = sdBox(x,y,z, 0.5,0.5,0.5);
    var s = 1;
    for(var i=0;i<4;i++){
      var a=((x*s%3)+3)%3, b=((y*s%3)+3)%3, c=((z*s%3)+3)%3;
      s*=3; var da=Math.min(a,3-a), db=Math.min(b,3-b), dc=Math.min(c,3-c);
      d=Math.max(d, -(Math.sqrt(Math.min(da*da+db*db, Math.min(da*da+dc*dc, db*db+dc*dc)))-1)/s);
    }
    return d;
  }

## Complete Example — Twisted Torus with Iridescent Color

\`\`\`js
var cx = 0, cy = -0.5, cz = -3;
sdfMesh(
  function(x, y, z) {
    var lx = x - cx, ly = y - cy, lz = z - cz;
    // Twist the domain around Y axis
    var tw = domainTwist(lx, ly, lz, 3.0);
    var rx = tw[0], rz = tw[1];
    // Torus: major radius 0.5, minor radius 0.15
    return sdTorus(rx, ly, rz, 0.5, 0.15);
  },
  function(x, y, z) {
    var lx = x - cx, lz = z - cz;
    var angle = Math.atan2(lz, lx);
    // Rainbow hue shift based on angle
    var t = angle / (Math.PI * 2) + 0.5;
    var r = Math.sin(t * Math.PI * 2) * 0.3 + 0.5;
    var g = Math.sin(t * Math.PI * 2 + 2.094) * 0.3 + 0.5;
    var b = Math.sin(t * Math.PI * 2 + 4.189) * 0.3 + 0.5;
    var n = noise3D(x * 10, y * 10, z * 10) * 0.05;
    return [Math.min(1, r + n), Math.min(1, g + n), Math.min(1, b + n)];
  },
  [cx - 0.85, cy - 0.25, cz - 0.85], [cx + 0.85, cy + 0.25, cz + 0.85], 100
);
\`\`\`

## Complete Example — Trefoil Knot using extrudePath

\`\`\`js
// Circular cross-section for the tube
var profile = [];
for (var i = 0; i <= 16; i++) {
  var a = i / 16 * Math.PI * 2;
  profile.push([Math.cos(a) * 0.04, Math.sin(a) * 0.04]);
}
// Trefoil knot path
var path = [];
for (var t = 0; t < 250; t++) {
  var a = t / 250 * Math.PI * 2;
  path.push([
    (Math.sin(a) + 2 * Math.sin(2 * a)) * 0.18,
    (Math.cos(a) - 2 * Math.cos(2 * a)) * 0.18 - 0.5,
    -Math.sin(3 * a) * 0.18 - 3
  ]);
}
extrudePath(profile, path, true, 0.83, 0.69, 0.22);
\`\`\``,

  "atmosphere-and-fx": `KEY RULES: sdfFn(x,y,z)→number, colorFn(x,y,z)→[r,g,b]. Three separate number args, NOT arrays. Always return. Pad bMin/bMax 20%+. Dimension args = constants only.

# Atmosphere & Effects

## Volumetric Clouds (SDF-based)
Build clouds with multiple smooth-unioned spheres + fbm3D displacement:
  function cloudSDF(x,y,z) {
    var d = sdSphere(x, y, z, 0.3);
    d = opSmoothUnion(d, sdSphere(x-0.2, y+0.05, z+0.1, 0.25), 0.1);
    d = opSmoothUnion(d, sdSphere(x+0.25, y-0.03, z-0.05, 0.2), 0.1);
    d = opDisplace(d, fbm3D(x*4, y*4, z*4, 4) * 0.08);
    return d;
  }
  Color: near-white [0.92, 0.93, 0.95] with noise variation.

## Flat Cloud Layer
grid at high Y with fbm2D density threshold:
  grid(-3,-6, 3,0, 80,80,
    function(x,z) { var d=fbm2D(x*0.5,z*0.5,4); return d>0.2 ? 1.0 : -100; },
    function(x,z) { return [0.9, 0.91, 0.93]; }
  );

## Scene Composition

Ground plane — always include to anchor objects:
  grid(-3,-6, 3,0, 20,20, function(){return -1.5;}, function(){return[0.35,0.32,0.28];});

Three-layer depth composition:
  - Foreground (Z=-1 to -2): small details close to camera
  - Midground (Z=-2.5 to -4): main subject
  - Background (Z=-4 to -6): distant elements, atmosphere

## Lighting Tricks (in colorFn)

Height warmth gradient:
  var warmth = 0.05 * (y + 1.5);
  return [baseR + warmth, baseG, baseB - warmth * 0.5];

Fake ground shadow:
  var dx=x-objX, dz=z-objZ, dist=Math.sqrt(dx*dx+dz*dz);
  var shadow = dist < shadowR ? 0.7 + 0.3*(dist/shadowR) : 1.0;
  return [baseR*shadow, baseG*shadow, baseB*shadow];

## Mesh-Based Particles

Rain (vertical quads):
  for(var i=0;i<5000;i++){
    var x=(random()-0.5)*6, y=random()*3-1.5, z=-1-random()*5;
    var h=0.03+random()*0.02;
    emitQuad(x-0.002,y,z, x+0.002,y,z, x+0.002,y+h,z, x-0.002,y+h,z, 0.6,0.7,0.85);
  }

Snow (tiny quads):
  for(var i=0;i<3000;i++){
    var x=(random()-0.5)*6, y=random()*3-1.5, z=-1-random()*5;
    var s=0.008+random()*0.008;
    emitQuad(x-s,y,z, x+s,y,z, x+s,y+s,z, x-s,y+s,z, 0.9,0.92,0.95);
  }

Falling leaves (angled, colored):
  for(var i=0;i<2000;i++){
    var x=(random()-0.5)*4, y=random()*3-1.5, z=-1-random()*4;
    var s=0.015+random()*0.01;
    var angle=random()*Math.PI, dx=Math.cos(angle)*s, dy=Math.sin(angle)*s;
    var t=random();
    emitQuad(x-dx,y-dy,z, x+dx,y-dy,z, x+dx,y+dy,z, x-dx,y+dy,z, 0.5+t*0.3,0.3+t*0.2,0.05);
  }`,
};
