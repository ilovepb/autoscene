export const SKILLS: Record<string, string> = {
  "advanced-sdf": `# Advanced SDF Techniques

## Inline Primitives (implement directly in sdfFn)

Ellipsoid (approximate):
  function sdEllipsoid(px,py,pz, rx,ry,rz) {
    var k0 = Math.sqrt(px*px/(rx*rx) + py*py/(ry*ry) + pz*pz/(rz*rz));
    var k1 = Math.sqrt(px*px/(rx*rx*rx*rx) + py*py/(ry*ry*ry*ry) + pz*pz/(rz*rz*rz*rz));
    return k0 * (k0 - 1.0) / k1;
  }

Rounded Box: sdBox(px,py,pz, sx,sy,sz) - radius

Octahedron (exact):
  function sdOctahedron(px,py,pz, s) {
    px=Math.abs(px); py=Math.abs(py); pz=Math.abs(pz);
    var m = px + py + pz - s;
    var q;
    if (3*px < m) q = [px,py,pz];
    else if (3*py < m) q = [py,pz,px];
    else if (3*pz < m) q = [pz,px,py];
    else return m * 0.57735027;
    var k = Math.max(0, Math.min(s, 0.5*(q[2]-q[1]+s)));
    return Math.sqrt((q[0])*(q[0]) + (q[1]-s+k)*(q[1]-s+k) + (q[2]-k)*(q[2]-k));
  }

Hex Prism (approximate):
  function sdHexPrism(px,py,pz, h,r) {
    px=Math.abs(px); pz=Math.abs(pz);
    var d = Math.max(px*0.866025+pz*0.5, pz) - r;
    return Math.sqrt(Math.max(d,0)*Math.max(d,0) + Math.max(Math.abs(py)-h,0)*Math.max(Math.abs(py)-h,0)) + Math.min(Math.max(d,Math.abs(py)-h),0);
  }

## Domain Operations (transform query point before SDF eval)

Mirror/Symmetry — reflect across plane:
  px = Math.abs(px);  // mirror across YZ plane
Both sides render the same shape. Combine axes for 2/4/8-fold symmetry.

Infinite Repetition — tile space:
  var repX = ((px - offset) % spacing + spacing) % spacing - spacing/2;
Use repX instead of px in SDF calls. Produces infinite copies.

Limited Repetition — clamp number of copies:
  var repX = px - spacing * Math.max(-N, Math.min(N, Math.round(px/spacing)));
N = number of copies on each side.

Instance ID for variation:
  var id = Math.round(px/spacing);
Use id to seed per-instance randomness (noise2D(id*100, 0)).

Twist — rotate XZ by angle proportional to Y:
  var c = Math.cos(k*py), s = Math.sin(k*py);
  var rx = px*c - pz*s, rz = px*s + pz*c;
Use rx,rz instead of px,pz. k controls twist rate.

Bend — rotate XY by angle proportional to X:
  var c = Math.cos(k*px), s = Math.sin(k*px);
  var ry = px*s + py*c; px = px*c - py*s; py = ry;

Elongation — stretch shape along axis:
  var ex = Math.max(Math.abs(px)-h, 0) * (px>0?1:-1);
Use ex instead of px. Stretches by 2h along X while preserving shape at ends.

Uniform Scale — scale any SDF:
  return sdfFn(px/s, py/s, pz/s) * s;
Evaluates SDF in scaled space, corrects distance.

## Shell / Onion

Turn any solid into a thin shell:
  var d = Math.abs(sdfFn(px,py,pz)) - thickness;
Stack for concentric layers: Math.abs(Math.abs(d) - t1) - t2

## Advanced Blending

XOR (only non-overlapping):
  Math.max(Math.min(d1,d2), -Math.max(d1,d2))

Chamfer Union (beveled edge):
  var ch = (d1 + d2) * 0.707;
  return Math.min(Math.min(d1,d2), ch);

Stair-Step Union (quantized blend):
  function opStairs(d1, d2, r, n) {
    var s = r/n, u = d2 - r;
    return Math.min(Math.min(d1,d2), 0.5*(u+d1+Math.abs(((u-d1)%s+s)%s*2-s)));
  }

## SDF-Based Ambient Occlusion (for colorFn)

Approximate AO by sampling SDF along the surface normal:
  // In colorFn, after computing the SDF and getting approximate normal
  var eps = 0.01;
  var nx = sdfFn(x+eps,y,z)-sdfFn(x-eps,y,z);
  var ny = sdfFn(x,y+eps,z)-sdfFn(x,y-eps,z);
  var nz = sdfFn(x,y,z+eps)-sdfFn(x,y,z-eps);
  var nl = Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=nl; ny/=nl; nz/=nl;
  var ao = 0;
  for (var i=1;i<=5;i++) { var h=0.02*i; ao += (h-sdfFn(x+nx*h,y+ny*h,z+nz*h))/Math.pow(2,i); }
  ao = 1 - Math.max(0, Math.min(1, ao*5));
  // Multiply color by ao to darken crevices

## Resolution & Bounds
- Pad bMin/bMax by ~20% beyond shape extents. Tight bounds clip geometry.
- Resolution 64–128 for smooth surfaces. No vertex limit.
- Higher resolution = more triangles = smoother normals and details.`,

  "natural-world": `# Natural World

## Organic Shape Construction Principles
The key to realistic natural forms is multi-scale detail and irregularity. Never use a single primitive for a complex organic shape. Layer complexity:

1. Base form — coarse silhouette from combined primitives
2. Medium detail — opSmoothUnion/Subtract to sculpt secondary features
3. Fine detail — fbm3D displacement for surface texture and irregularity
4. Color variation — noise-driven color in colorFn to break uniformity

Use MANY primitives to capture the true silhouette of the object. Think about what makes it recognizable in real life and model those features. Use high resolution (80–128) and generous bounding boxes.

Heavy noise displacement is critical for organic realism:
  opDisplace(d, fbm3D(x*freq, y*freq, z*freq, octaves) * amplitude)
- Low freq (2–4) + high amp (0.1–0.2): large lumps, overall shape irregularity
- High freq (8–15) + low amp (0.02–0.06): bark texture, leaf roughness, skin pores
- Stack multiple: opDisplace(opDisplace(d, low_freq), high_freq)

Branching structures: use multiple sdCapsules at natural angles. Real branches taper, curve, and subdivide — use per-branch noise offsets for variation.

## Scattering & Placement

Forest/field scattering:
  for (var i = 0; i < N; i++) {
    var tx = minX + random()*(maxX-minX);
    var tz = minZ + random()*(maxZ-minZ);
    var scale = 0.5 + random()*0.5;
    // Build SDF centered at tx, groundY, tz with scale multiplier
    // Use noise2D(tx*100, tz*100) for per-instance shape variation
  }

Phyllotaxis (golden angle spiral — for flower petals, sunflower seeds, leaf arrangements):
  var GA=2.39996; // 137.5° in radians
  for(var i=0;i<N;i++){var a=i*GA; var r=Math.sqrt(i)*spacing; var px=cx+Math.cos(a)*r; var pz=cz+Math.sin(a)*r;}

Poisson Disk (min-distance scatter — natural ground cover, trees, rocks):
  var pts=[]; for(var i=0;i<N*10;i++){var x=minX+random()*(maxX-minX); var z=minZ+random()*(maxZ-minZ);
    var ok=true; for(var j=0;j<pts.length;j++){var dx=x-pts[j][0],dz=z-pts[j][1]; if(dx*dx+dz*dz<minDist*minDist){ok=false;break;}}
    if(ok)pts.push([x,z]); if(pts.length>=N)break;}

## Terrain (grid heightfields)

Rolling Hills: function(x,z){return -1.5+fbm2D(x*0.8,z*0.8)*0.5;}

Ridged Multifractal (sharp mountain ridges):
  function(x,z) {
    var sum=0, amp=1, freq=0.5, weight=1;
    for(var i=0;i<6;i++){
      var n=1-Math.abs(noise2D(x*freq,z*freq));
      n=n*n*weight; weight=Math.min(1,Math.max(0,n*2));
      sum+=n*amp; amp*=0.5; freq*=2;
    }
    return -1.0+sum*0.6;
  }

Terracing: var h=fbm2D(x*0.6,z*0.6); return Math.round(h*steps)/steps;

Island Falloff:
  var dx=(x-cx)/rx, dz=(z-cz)/rz;
  var falloff=1-Math.min(1,dx*dx+dz*dz);
  return baseY+fbm2D(x*0.8,z*0.8)*0.6*falloff;

Swiss Turbulence (erosion-like):
  var sum=0,amp=1,freq=0.5,dx2=0,dz2=0;
  for(var i=0;i<6;i++){
    var n=noise2D((x+dx2)*freq,(z+dz2)*freq);
    dx2+=n*amp*1.5; dz2+=n*amp*1.5;
    sum+=(1-Math.abs(n))*amp; amp*=0.5; freq*=2;
  }

Use resolution 100–200 for terrain grids. No vertex limit.

## Water
Still water: grid at constant y=waterLevel with water color
Waves: y = waterLevel + sum of sine terms with different frequencies and directions (Gerstner-like)
  y = waterLevel + 0.02*Math.sin(x*3+z*2) + 0.01*Math.sin(x*5-z*3)
Caustic floor color: var c=Math.sin(x*8)*Math.sin(z*8)*0.5+0.5; modulate blue/green by c

## Snow & Ice
Snow accumulation in colorFn: compute surface normal, if normal.y > threshold, blend toward white [0.9,0.9,0.95]
Snow increases realism when applied as a colorFn effect rather than separate geometry.

## Nature Color Palette
Bark: [0.35,0.22,0.10], Foliage: [0.15,0.40,0.08], Moss: [0.20,0.35,0.12]
Grass: [0.20,0.45,0.10], Dry grass: [0.55,0.50,0.25], Rock: [0.45,0.42,0.38]
Sand: [0.76,0.70,0.50], Snow: [0.90,0.90,0.95], Deep water: [0.05,0.15,0.40]
Shallow water: [0.10,0.35,0.55], Autumn leaf: [0.70,0.35,0.08], Spring leaf: [0.30,0.55,0.15]`,

  "materials-and-color": `# Materials & Color

## Material RGB Reference (values 0–1)

Wood: oak [0.55,0.35,0.17], pine [0.65,0.50,0.30], walnut [0.30,0.18,0.10], birch [0.75,0.65,0.50], mahogany [0.45,0.22,0.12], cherry [0.60,0.30,0.15], driftwood [0.55,0.50,0.42]
Stone: granite [0.55,0.52,0.50], sandstone [0.72,0.62,0.45], slate [0.35,0.38,0.40], marble [0.90,0.88,0.85], limestone [0.78,0.75,0.68], basalt [0.25,0.25,0.28], obsidian [0.05,0.05,0.08]
Metal: iron [0.42,0.40,0.38], copper [0.72,0.45,0.20], gold [0.83,0.69,0.22], bronze [0.55,0.45,0.25], silver [0.75,0.75,0.78], rust [0.55,0.25,0.10], patina [0.30,0.65,0.50]
Earth: dry soil [0.45,0.35,0.22], wet soil [0.25,0.18,0.10], sand [0.76,0.70,0.50], clay [0.60,0.42,0.30], gravel [0.47,0.47,0.47], mud [0.35,0.25,0.15]
Vegetation: fresh leaf [0.18,0.42,0.10], dried [0.50,0.45,0.20], moss [0.20,0.35,0.12], autumn red [0.70,0.20,0.08], autumn gold [0.80,0.65,0.15], bark [0.35,0.22,0.10], lichen [0.55,0.60,0.30]
Water/Sky: deep ocean [0.05,0.15,0.40], shallow [0.10,0.35,0.55], tropical [0.15,0.65,0.60], sky noon [0.53,0.81,0.92], sunset [0.95,0.55,0.25], dawn [0.90,0.60,0.45], night [0.02,0.02,0.08]
Skin: light [0.90,0.75,0.65], medium [0.70,0.50,0.35], dark [0.40,0.25,0.15]
Misc: bone [0.88,0.85,0.78], ivory [0.93,0.90,0.82], terracotta [0.72,0.40,0.22], brick [0.60,0.30,0.25], concrete [0.60,0.58,0.55], glass [0.85,0.90,0.92]

## Procedural Textures (in colorFn)

Marble: var v=Math.sin(x*freq+fbm3D(x*s,y*s,z*s,4)*power)*0.5+0.5; return lerp(baseColor,veinColor,v);
  Example: var v=Math.sin(x*10+fbm3D(x*4,y*4,z*4)*3)*0.5+0.5; return[0.9-v*0.15, 0.88-v*0.15, 0.85-v*0.1];

Wood Grain: var ring=Math.sin(Math.sqrt((x-cx)*(x-cx)+(z-cz)*(z-cz))*freq+fbm3D(x*2,y*2,z*2)*warp)*0.5+0.5;
  Example: var ring=Math.sin(Math.sqrt(x*x+z*z)*20+fbm3D(x*2,y*2,z*2)*2)*0.5+0.5; return[0.55+ring*0.1,0.35+ring*0.05,0.17-ring*0.05];

Brick Pattern: var bx=((x/brickW)%1+1)%1, bz=((z/brickH+Math.floor(x/brickW)*0.5)%1+1)%1;
  var mortar=(bx<0.05||bx>0.95||bz<0.05||bz>0.95)?1:0;
  return mortar ? [0.7,0.7,0.65] : [0.6+noise2D(x*10,z*10)*0.08, 0.30, 0.25];

Voronoi/Cellular: seed N points, find nearest-distance for cell patterns:
  var seeds=[]; for(var i=0;i<20;i++) seeds.push([minX+random()*(maxX-minX), minZ+random()*(maxZ-minZ)]);
  // In colorFn: var minD=1e10,id=0; for(var i=0;i<seeds.length;i++){var dx=x-seeds[i][0],dz=z-seeds[i][1],d=dx*dx+dz*dz;if(d<minD){minD=d;id=i;}}
  // Use minD for edge detection (F1), or track 2nd-nearest for F2-F1 cobblestone pattern

## Coloring Strategies

Height-based biome blending:
  function ss(a,b,t){t=(t-a)/(b-a);t=t<0?0:t>1?1:t;return t*t*(3-2*t);}
  var h=heightFn(x,z);
  // Water → sand → grass → rock → snow with smooth transitions
  if(h<waterLevel) return [0.1,0.3,0.6];
  var sandT=ss(waterLevel,waterLevel+0.05,h);
  var grassT=ss(waterLevel+0.03,waterLevel+0.15,h);
  // Blend between material colors using sandT, grassT, etc.

Slope-based (approximate normal from heightFn):
  var eps=0.01;
  var nx=heightFn(x+eps,z)-heightFn(x-eps,z);
  var nz=heightFn(x,z+eps)-heightFn(x,z-eps);
  var slope=Math.sqrt(nx*nx+nz*nz);
  // slope > 0.5: cliff/rock, slope < 0.2: grass/flat

Noise variation: always add fbm3D(x*s,y*s,z*s)*0.05–0.1 to base color for natural imperfection.

## Color Harmony (for multi-object scenes)
Complementary: warm subject (orange/red) on cool background (blue/teal), or vice versa
Analogous: stay within 30° hue range for cohesive mood (all greens, all warm tones)
Triadic: pick 3 colors 120° apart for vibrant variety (red/blue/yellow tints)
Earth tones: restrict to browns, greens, grays for naturalism
Monochromatic: single hue, vary lightness/saturation for elegant simplicity

## Weathering & Aging

Rust: var rustMask=fbm3D(x*8,y*8,z*8,4)*0.5+0.5; if(rustMask>0.6){blend toward [0.55,0.25,0.10]}
  Apply more on upward-facing and exposed surfaces.

Moss Growth: var mossMask=fbm3D(x*6,y*6,z*6)*0.5+0.5; var upFacing=ny>0.5?1:0;
  if(mossMask*upFacing>0.4){blend toward [0.20,0.35,0.12]}

Dirt Accumulation: darken lower/concave regions. var dirt=1-ss(-1.5,-0.8,y); blend toward [0.30,0.22,0.12]

Patina (copper aging): blend toward [0.30,0.65,0.50] using noise mask on exposed surfaces

Paint Chipping: var chip=fbm3D(x*15,y*15,z*15,5); if(chip>0.55) show base metal color, else show paint color

## Math Utilities
smoothstep: function ss(a,b,t){t=(t-a)/(b-a);t=t<0?0:t>1?1:t;return t*t*(3-2*t);}
lerp color: function lc(a,b,t){return[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];}
bias: function bias(x,b){return x/((1/b-2)*(1-x)+1);}
gain: function gain(x,g){return x<0.5?bias(2*x,g)/2:1-bias(2-2*x,g)/2;}`,

  "objects-and-characters": `# Objects & Characters — Construction Techniques

## Design Philosophy
Aim for realism and recognizability. Use your knowledge of what real objects look like. Don't simplify — use as many primitives as needed to capture the true shape. Every object should have:
1. Accurate overall silhouette (the most important thing for recognition)
2. Secondary features that define its character (handles, textures, joints, etc.)
3. Surface detail via noise displacement and varied colorFn
4. High resolution (80–128) for smooth, detailed surfaces

## Composition Techniques

Building complex shapes from SDF primitives:
- Start with the dominant volume, then add/subtract secondary features
- Use opSmoothUnion with small k (0.02–0.08) for natural joints between parts
- Use opSubtract/opSmoothSubtract for cavities, indentations, carving detail
- Apply opDisplace with fbm3D for surface imperfection — real objects are never perfectly smooth
- Use opRound to soften hard edges on manufactured objects

Multi-part color in colorFn:
  Evaluate individual SDF distances to determine which "part" of the object a point is on:
  var dPartA = sdSphere(...); var dPartB = sdCapsule(...);
  if (dPartA < dPartB) return colorA; else return colorB;
  This allows different colors/materials per region of a single sdfMesh.

## Symmetry & Repetition for Realism

Mirror symmetry (bilateral — animals, faces, vehicles):
  px = Math.abs(px - cx) + cx;  // mirror across center
  Model only one side; the other renders automatically.

Angular repetition (wheels, petals, gear teeth, columns):
  var angle = Math.atan2(pz-cz, px-cx);
  var repAngle = Math.PI*2/N;
  angle = ((angle % repAngle) + repAngle) % repAngle - repAngle/2;
  var lx = Math.cos(angle) * radius, lz = Math.sin(angle) * radius;
  // Evaluate primitive at (lx, py, lz)

Instance ID for per-copy variation:
  var id = Math.round(angle / repAngle);
  // Use noise2D(id*100, 0) for per-instance size/color variation

## Articulation & Posing

Posing limbs/appendages: each limb is a separate SDF primitive positioned and angled independently. Use capsules for organic limbs, cylinders/boxes for rigid parts.

Domain bending for curvature:
  var c=Math.cos(k*px), s=Math.sin(k*px);
  var by=px*s+py*c; px=px*c-py*s; py=by;
  Produces natural curves for tails, tentacles, horns, arches.

Domain twist for spiral features:
  var c=Math.cos(k*py), s=Math.sin(k*py);
  var rx=px*c-pz*s, rz=px*s+pz*c;
  Use for drill bits, twisted columns, horns, spiral shells.

## Hollow & Thin-Walled Objects
Shell: Math.abs(sdf) - wallThickness
  For cups, bowls, helmets, pipes, lampshades, vases.

Combine with opIntersect to cut openings:
  var shell = Math.abs(sdSphere(px,py,pz, R)) - 0.02;
  var cut = sdPlane(px,py,pz, 0,1,0, cutY);  // cut top off
  return opIntersect(shell, cut);

## Lathe for Rotational Objects
lathe() is ideal for any object with rotational symmetry: vases, bottles, columns, bowls, chess pieces, mushrooms, wine glasses.
Define the profile as [[radius, yOffset], ...] tracing the silhouette from bottom to top.
Use many profile points (10–20+) for smooth curves. High segment count (24–48) for round surfaces.

## Scale Reference
Person ≈ 0.4–0.6 units tall. Tree ≈ 0.5–1.0. Building ≈ 0.8–1.5. Small object ≈ 0.1–0.3.
Scene center: (0, -0.5, -3). Ground level: y ≈ -1.5.`,

  "math-and-patterns": `# Mathematical Shapes & Patterns

## Implicit Surfaces (as sdfFn for sdfMesh)

Gyroid — triply periodic minimal surface:
  function(x,y,z) {
    var s = 6;  // scale (controls cell size — higher = more cells)
    return Math.sin(x*s)*Math.cos(y*s) + Math.sin(y*s)*Math.cos(z*s) + Math.sin(z*s)*Math.cos(x*s);
  }
  Shell version: Math.abs(gyroid) - thickness (0.1–0.3)
  Color by position: var t=y*0.5+0.5; return[0.2+t*0.3, 0.4+t*0.2, 0.6-t*0.2];

Schwarz P Surface — another TPMS:
  function(x,y,z) { var s=6; return Math.cos(x*s)+Math.cos(y*s)+Math.cos(z*s); }
  Shell: Math.abs(d) - 0.2

Schwarz D (Diamond):
  function(x,y,z) { var s=6; return Math.sin(x*s)*Math.sin(y*s)*Math.sin(z*s) + Math.sin(x*s)*Math.cos(y*s)*Math.cos(z*s) + Math.cos(x*s)*Math.sin(y*s)*Math.cos(z*s) + Math.cos(x*s)*Math.cos(y*s)*Math.sin(z*s); }

## Parametric Curves (via extrudePath or emit)

Trefoil Knot — a (2,3)-torus knot:
  var path=[]; for(var t=0;t<200;t++){var a=t/200*Math.PI*2;
    path.push([Math.sin(a)+2*Math.sin(2*a), Math.cos(a)-2*Math.cos(2*a), -Math.sin(3*a)]);
  }
  // Scale and offset: multiply coords by 0.15, offset by [0,-0.5,-3]
  // Use extrudePath with circular profile for solid knot

General Torus Knot (p,q):
  var R=0.3, r=0.1;
  for(var t=0;t<300;t++){var a=t/300*Math.PI*2;
    var x=(R+r*Math.cos(q*a))*Math.cos(p*a);
    var y=r*Math.sin(q*a);
    var z=(R+r*Math.cos(q*a))*Math.sin(p*a);
    path.push([x,y-0.5,z-3]);
  }

Möbius Strip (emit as quad grid):
  for(var u=0;u<200;u++){for(var v=0;v<20;v++){
    var a=u/200*Math.PI*2, s=(v/20-0.5)*0.15;
    var x=(0.3+s*Math.cos(a/2))*Math.cos(a);
    var y=(0.3+s*Math.cos(a/2))*Math.sin(a);
    var z=s*Math.sin(a/2);
    emit(x, y-0.5, z-3, 0.6,0.4,0.8, 0.01);
  }}
  Or use emitQuad connecting adjacent grid points for a solid strip.

Lissajous Curves:
  for(var t=0;t<1000;t++){var s=t/1000*Math.PI*2*4;
    var x=Math.sin(3*s)*0.3; var y=Math.sin(4*s+0.5)*0.3; var z=Math.sin(5*s)*0.3;
    emit(x, y-0.5, z-3, 0.8,0.4,0.2, 0.015);
  }
  Vary the frequency ratios (3,4,5) for different patterns.

## Spirals

Helix: x=R*cos(t), y=pitch*t, z=R*sin(t) — use as extrudePath spine
  var path=[]; for(var t=0;t<100;t++){var s=t/100*Math.PI*6;
    path.push([0.2*Math.cos(s), s*0.05-0.8, 0.2*Math.sin(s)-3]);
  }

Archimedean Spiral (flat): r = a + b*theta
  for(var t=0;t<500;t++){var a=t/500*Math.PI*8; var r=0.05+a*0.03;
    emit(Math.cos(a)*r, -1, Math.sin(a)*r-3, 0.5,0.7,0.3, 0.015);}

Logarithmic Spiral (nautilus): r = a * exp(b*theta)
  for(var t=0;t<500;t++){var a=t/500*Math.PI*6; var r=0.05*Math.exp(0.1*a);
    emit(Math.cos(a)*r, -1, Math.sin(a)*r-3, 0.8,0.7,0.5, 0.015);}

Golden Spiral: logarithmic spiral with b ≈ 0.3063 (growth factor per quarter turn = golden ratio)

## Voronoi / Cellular Patterns

Implementation (2D, for heightFn or colorFn):
  // Pre-generate seed points
  var seeds=[]; for(var i=0;i<N;i++) seeds.push([minX+random()*(maxX-minX), minZ+random()*(maxZ-minZ), random()]);
  // In function: find nearest seed
  var minD=1e10, minD2=1e10, id=0;
  for(var i=0;i<seeds.length;i++){
    var dx=x-seeds[i][0], dz=z-seeds[i][1];
    var d=Math.sqrt(dx*dx+dz*dz);
    if(d<minD){minD2=minD; minD=d; id=i;} else if(d<minD2){minD2=d;}
  }
  // F1 = minD (distance to nearest — smooth cells)
  // F2-F1 = minD2-minD (cell edges — cobblestone, cracked earth)
  // id = cell index (for per-cell random color)

3D Voronoi: same pattern but with y coordinate included

## Coordinate Transforms

Polar: var r=Math.sqrt(x*x+z*z); var theta=Math.atan2(z,x);
  Use for radial patterns, angular repetition, distance-from-center falloff

Spherical: var r=Math.sqrt(x*x+y*y+z*z); var phi=Math.acos(y/r); var theta=Math.atan2(z,x);
  Use for globe patterns, latitude/longitude effects

Back to Cartesian: x=r*Math.sin(phi)*Math.cos(theta); y=r*Math.cos(phi); z=r*Math.sin(phi)*Math.sin(theta);

## Bezier Curves

Quadratic: function bezier2(t,p0,p1,p2){var u=1-t; return u*u*p0+2*u*t*p1+t*t*p2;}
Cubic: function bezier3(t,p0,p1,p2,p3){var u=1-t; return u*u*u*p0+3*u*u*t*p1+3*u*t*t*p2+t*t*t*p3;}
Use for smooth height curves, path generation, or profile shapes.

## Fractals

Sierpinski Tetrahedron (emit points):
  function sierpinski(x,y,z,depth){
    if(depth<=0){emit(x,y,z,0.8,0.3,0.3,0.01);return;}
    var h=Math.pow(0.5,depth);
    sierpinski(x-h,y-h,z-h,depth-1);
    sierpinski(x+h,y-h,z+h,depth-1);
    sierpinski(x-h,y-h,z+h,depth-1);
    sierpinski(x,y+h,z,depth-1);
  }

Menger Sponge (SDF, iterative):
  function(x,y,z) {
    var d = sdBox(x,y,z, 0.5,0.5,0.5);
    var s = 1;
    for(var i=0;i<4;i++){
      var a=((x*s%3)+3)%3; var b=((y*s%3)+3)%3; var c=((z*s%3)+3)%3;
      s*=3; var da=Math.min(a,3-a), db=Math.min(b,3-b), dc=Math.min(c,3-c);
      var cross=Math.min(Math.min(da*da+db*db, da*da+dc*dc), db*db+dc*dc);
      d=Math.max(d, -(Math.sqrt(cross)-1)/s);
    }
    return d;
  }`,

  "atmosphere-and-fx": `# Atmosphere & Effects

## Particle Systems (emit)
emit() renders as flat circular dots. ONLY use for particles, never for solid surfaces. Use sdfMesh for solid objects.
No point limit — buffers grow dynamically. Use generous counts for rich effects.

## Rain
  for(var i=0;i<50000;i++){
    var x=(random()-0.5)*6, y=random()*3-1.5, z=-1-random()*5;
    emit(x, y, z, 0.6,0.7,0.85, 0.012);
  }

## Snow
  for(var i=0;i<40000;i++){
    var x=(random()-0.5)*6, y=random()*3-1.5, z=-1-random()*5;
    var drift=fbm2D(x*2+y,y*0.5)*0.3;  // wind drift
    emit(x+drift, y, z, 0.9,0.92,0.95, 0.018);
  }

## Fire (two-zone: hot core + cool envelope)
  var fx=0,fy=-1,fz=-3;
  for(var i=0;i<40000;i++){
    var t=random(), spread=t*0.3;
    var x=fx+(random()-0.5)*spread, y=fy+t*0.8, z=fz+(random()-0.5)*spread;
    var core=1-Math.sqrt((x-fx)*(x-fx)+(z-fz)*(z-fz))*5;
    core=Math.max(0,Math.min(1,core));
    var r=1.0, g=0.9*core+0.2*(1-t)*(1-core), b=0.7*core*core;
    emit(x,y,z, r,Math.max(0,g),Math.max(0,b), 0.02);
  }

## Smoke / Fog
  var sx=0,sy=-0.5,sz=-3;
  for(var i=0;i<30000;i++){
    var t=random(), spread=t*0.6;
    var x=sx+(random()-0.5)*spread, y=sy+t*1.5, z=sz+(random()-0.5)*spread;
    var g=0.5+t*0.3, a=1-t*0.5;
    emit(x,y,z, g,g,g*0.95, 0.02+t*0.04);
  }

## Sparks
  var ox=0,oy=-1,oz=-3;
  for(var i=0;i<20000;i++){
    var angle=random()*Math.PI*2, speed=0.5+random()*1.5, t=random();
    var x=ox+Math.cos(angle)*speed*t, y=oy+t*speed*0.8-t*t*2;
    var z=oz+Math.sin(angle)*speed*t*0.3;
    emit(x,y,z, 1,0.6*(1-t),0.1*(1-t), 0.012);
  }

## Fireworks (radial burst with gravity)
  var bx=0,by=0,bz=-3;
  for(var i=0;i<15000;i++){
    var theta=random()*Math.PI*2, phi=random()*Math.PI;
    var speed=0.3+random()*0.5, t=random();
    var x=bx+Math.sin(phi)*Math.cos(theta)*speed*t;
    var y=by+Math.cos(phi)*speed*t-0.5*t*t;  // gravity
    var z=bz+Math.sin(phi)*Math.sin(theta)*speed*t;
    var bright=1-t;
    emit(x,y,z, 1*bright,0.3*bright,0.5*bright, 0.015);
  }

## Waterfall
  var wx=0,wy=0,wz=-3, wh=1.0;
  for(var i=0;i<30000;i++){
    var t=random(); // 0=top, 1=bottom
    var x=wx+(random()-0.5)*0.15;
    var y=wy-t*wh;
    var z=wz+(random()-0.5)*0.05;
    emit(x,y,z, 0.7,0.8,0.9, 0.015);
  }
  // Mist at base
  for(var i=0;i<10000;i++){
    var x=wx+(random()-0.5)*0.6, y=wy-wh+(random()-0.5)*0.2;
    var z=wz+(random()-0.5)*0.3;
    emit(x,y,z, 0.85,0.88,0.92, 0.025);
  }

## Stars / Starfield
  for(var i=0;i<15000;i++){
    var x=(random()-0.5)*8, y=random()*2+0.5, z=-1-random()*5;
    var b=0.3+random()*0.7;
    var tint=random(); // warm/cool variation
    emit(x,y,z, b+tint*0.1,b,b+0.1*(1-tint), 0.008+random()*0.012);
  }

## Dust Motes / Pollen
  for(var i=0;i<8000;i++){
    var x=(random()-0.5)*4, y=random()*2-1, z=-1-random()*4;
    emit(x,y,z, 0.85,0.80,0.60, 0.01+random()*0.01);
  }

## Clouds
Volumetric approach: sdfMesh with multiple smooth-unioned spheres + heavy fbm3D displacement for billowy shape.
Flat cloud layer: grid at high Y with fbm2D density threshold — return very low Y for thin regions to hide them.
Color: near-white with subtle noise variation for depth.

## Scene Composition & Framing

Ground Plane: always include a floor to ground the scene:
  grid(-3,-6,3,0, 20,20, function(){return -1.5;}, function(){return[0.35,0.32,0.28];});

Three-Layer Depth:
  - Foreground (Z=-1 to -2): small detail, particles close to camera
  - Midground (Z=-2.5 to -4): main subject (the object/scene the user asked for)
  - Background (Z=-4 to -6): distant elements, atmosphere, sky particles

Scale Reference: a person ≈ 0.4 units tall. A tree ≈ 0.5–1.0 units. A building ≈ 0.8–1.5 units.

Camera: at origin looking down -Z. Objects at center of scene (0, -0.5, -3) are well-framed.

## Lighting Tricks (in colorFn)
Ambient Y-gradient: vary warmth by height:
  var warmth=0.05*(y+1.5); return[baseR+warmth, baseG, baseB-warmth*0.5];

Fake shadow on ground: in ground grid colorFn, darken under objects:
  var dx=x-objX, dz=z-objZ, dist=Math.sqrt(dx*dx+dz*dz);
  var shadow=dist<shadowR ? 0.7+0.3*(dist/shadowR) : 1.0;
  return[baseR*shadow, baseG*shadow, baseB*shadow];

Rim light approximation: in sdfMesh colorFn, boost brightness where normal faces toward camera (+Z):
  // nz is the Z component of the surface normal
  var rim = Math.max(0, nz) * 0.2;
  return [baseR+rim, baseG+rim, baseB+rim];

## Density & Size Reference
- Dust/stars: 0.008–0.012 size, 5k–15k points
- Rain/snow: 0.012–0.020 size, 30k–50k points
- Smoke/fire: 0.020–0.050 size, 25k–40k points
- Sparks: 0.010–0.015 size, 15k–25k points
- More points = richer effect. Don't hold back.`,
};
