const MapDataBR = {
  width: 4000,
  height: 4000,
  obstacles: [],
  bushes: [],
  crates: [],
  spawns: [],
};

// --- UTILS ---
const addObs = (x, y, w, h, type = "WALL") =>
  MapDataBR.obstacles.push({ x, y, w, h, type });

// New Bush with W/H (Rect)
const addBush = (x, y, w, h) => MapDataBR.bushes.push({ x, y, w, h });

const addCrate = (x, y) =>
  MapDataBR.crates.push({
    x,
    y,
    w: 60,
    h: 60,
    hp: 100,
    maxHp: 100,
    active: true,
  });

// Fixed Cluster Helper
const addCrateCluster = (centerX, centerY, rows, cols) => {
  const spacing = 70;
  const startX = centerX - (cols * spacing) / 2;
  const startY = centerY - (rows * spacing) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addCrate(startX + c * spacing, startY + r * spacing);
    }
  }
};

// 1. BOUNDARIES
addObs(0, 0, 4000, 50);
addObs(0, 3950, 4000, 50);
addObs(0, 0, 50, 4000);
addObs(3950, 0, 50, 4000);

// 2. THE FEAST (Center)
const cx = 2000,
  cy = 2000;

// Central Ring of Bushes (Spaced out & BIGGER)
// Top/Bot blocks
addBush(cx - 350, cy - 500, 700, 150); // Increased Size
addBush(cx - 350, cy + 350, 700, 150);
// Left/Right blocks
addBush(cx - 500, cy - 350, 150, 700);
addBush(cx + 350, cy - 350, 150, 700);

// THE FEAST CORE (Clean 2x3 Grid - 6 Crates Total per side)
// Left Cluster
addCrateCluster(cx - 200, cy, 3, 2);
// Right Cluster
addCrateCluster(cx + 200, cy, 3, 2);

// Central Protectors (Walls) - Expanded slightly ensuring no bush overlap
addObs(cx - 450, cy - 450, 300, 50); // NW Corner H
addObs(cx + 150, cy - 450, 300, 50); // NE Corner H
addObs(cx - 450, cy + 400, 300, 50); // SW Corner H
addObs(cx + 150, cy + 400, 300, 50); // SE Corner H

// 2.5 CARDINAL BLOCKS (User Request: "Rectangle 2 carrer de largeur, long")
// Placing thick rectangular blocks in the open mid-areas.
const blockOff = 1000;
const blockLen = 400; // "Long un peu"
const blockThick = 140; // "2 carrer de largeur" (approx 70*2)

// Top Block
addObs(cx - blockLen / 2, cy - blockOff, blockLen, blockThick, "WALL");

// Bottom Block
addObs(cx - blockLen / 2, cy + blockOff, blockLen, blockThick, "WALL");

// Left Block
addObs(cx - blockOff, cy - blockLen / 2, blockThick, blockLen, "WALL");

// Right Block
addObs(cx + blockOff, cy - blockLen / 2, blockThick, blockLen, "WALL");

// 2.6 OUTER CARDINAL WALLS (User Request: "Ajoute d'autre mur, ne remplace pas")
// Filling the outer void at offset 1600.
const outerOff = 1600;
const outerLen = 500; // Longer wall
const outerThick = 50;

// Top Outer
addObs(cx - outerLen / 2, cy - outerOff, outerLen, outerThick, "WALL");
// Bottom Outer
addObs(cx - outerLen / 2, cy + outerOff, outerLen, outerThick, "WALL");
// Left Outer
addObs(cx - outerOff, cy - outerLen / 2, outerThick, outerLen, "WALL");
// Right Outer
addObs(cx + outerOff, cy - outerLen / 2, outerThick, outerLen, "WALL");

// 2.7 GAP FILLERS (User Request: "Ajoute un autre mur")
// Filling the gap between Block (1000) and Outer (1600)
const gapOff = 1350;
const gapLen = 300;
const gapThick = 40;

// Top Gap
addObs(cx - gapLen / 2, cy - gapOff, gapLen, gapThick, "WALL");
// Bottom Gap
addObs(cx - gapLen / 2, cy + gapOff, gapLen, gapThick, "WALL");
// Left Gap
addObs(cx - gapOff, cy - gapLen / 2, gapThick, gapLen, "WALL");
// Right Gap
addObs(cx + gapOff, cy - gapLen / 2, gapThick, gapLen, "WALL");

// 2.8 EXTRA FILLER (User Request: "Encore d'autre mur")
// Squeezing a 4th layer between Block (1000) and Gap (1350) -> 1175
const extraOff = 1175;
const extraLen = 200; // Smaller chunks
const extraThick = 40;

// Top Extra
addObs(cx - extraLen / 2, cy - extraOff, extraLen, extraThick, "WALL");
// Bottom Extra
addObs(cx - extraLen / 2, cy + extraOff, extraLen, extraThick, "WALL");
// Left Extra
addObs(cx - extraOff, cy - extraLen / 2, extraThick, extraLen, "WALL");
// Right Extra
addObs(cx + extraOff, cy - extraLen / 2, extraThick, extraLen, "WALL");

// 2.9 DIAGONAL CORNERS (User Request: "Red Lines - L Shapes")
// L-shaped walls in the diagonals to fill the corners.
const diagOff = 1200;
const diagLen = 400;
const diagThick = 50;

// Top-Left L
addObs(cx - diagOff, cy - diagOff, diagLen, diagThick, "WALL"); // H
addObs(cx - diagOff, cy - diagOff, diagThick, diagLen, "WALL"); // V

// Top-Right L
addObs(cx + diagOff - diagLen, cy - diagOff, diagLen, diagThick, "WALL"); // H
addObs(cx + diagOff, cy - diagOff, diagThick, diagLen, "WALL"); // V

// Bot-Left L
addObs(cx - diagOff, cy + diagOff, diagLen, diagThick, "WALL"); // H
addObs(cx - diagOff, cy + diagOff - diagLen, diagThick, diagLen, "WALL"); // V

// Bot-Right L
addObs(cx + diagOff - diagLen, cy + diagOff, diagLen, diagThick, "WALL"); // H
addObs(cx + diagOff, cy + diagOff - diagLen, diagThick, diagLen, "WALL"); // V

// 3.0 STRATEGIC BUSHES (User Request: "Buissons dans les coins et a coter des murs")
// Adding bushes in the new nooks and crannies.

// A. Bushes tucked in Diagonal Corners (Offset 1200)
// Inside the Top-Left L
addBush(cx - diagOff + 50, cy - diagOff + 50, 200, 200);
// Inside the Top-Right L
addBush(cx + diagOff - 250, cy - diagOff + 50, 200, 200);
// Inside Bot-Left L
addBush(cx - diagOff + 50, cy + diagOff - 250, 200, 200);
// Inside Bot-Right L
addBush(cx + diagOff - 250, cy + diagOff - 250, 200, 200);

// B. Bushes alongside Outer Cardinal Walls - REMOVED (User Request: "Enleve les buisson sur le mur")
// No overlapping bushes allowed.

// 3. SYMMETRICAL QUADRANTS
const buildQuadrant = (offsetX, offsetY, flipX, flipY) => {
  const mx = (val) => (flipX ? -val : val);
  const my = (val) => (flipY ? -val : val);

  // Helper to normalize rect coords for flipped quadrants
  const placeRect = (xOffset, yOffset, w, h, type = "WALL") => {
    let x = cx + mx(xOffset);
    let y = cy + my(yOffset);
    if (flipX) x -= w;
    if (flipY) y -= h;

    if (type === "BUSH") addBush(x, y, w, h);
    else addObs(x, y, w, h, type);
  };

  const placeCrates = (xOffset, yOffset, rows, cols) => {
    let x = cx + mx(xOffset);
    let y = cy + my(yOffset);
    addCrateCluster(x, y, rows, cols);
  };

  // Block 1: Near Center (Bunker)
  // Wall L-Shape: Top and Left. Open into Bottom-Right. RESTORED (User Request)
  placeRect(600, 600, 300, 50, "WALL"); // Top Bar
  placeRect(600, 600, 50, 300, "WALL"); // Left Bar

  // MANUAL CRATES (3 Boxes: Corner + Extensions)
  // Corner of "Inside": 565, 565. (Calculated to touch wall at 1400)
  // We place 3 boxes loosely in the Corner.
  {
    let bx = 565,
      by = 565;
    placeCrates(bx, by, 1, 1); // Corner
    placeCrates(bx + 70, by, 1, 1); // Right
    placeCrates(bx, by + 70, 1, 1); // Down
  }

  // Bush Stash (Bigger) - REMOVED to unify
  // placeRect(500, 500, 150, 150, "BUSH");

  // NEW: Connected L-Shape Bush hugging the wall (External)
  // Wall is at 600,600. Top Bar (300w, 50h), Left Bar (50w, 300h).

  // 1. Vertical Segment (Left of Left Wall + Corner)
  // x=450, y=450, w=152 (Overlap by 2px to right), h=450
  placeRect(450, 450, 152, 450, "BUSH");

  // 2. Horizontal Segment (Above Top Wall)
  // x=600 (Overlap start), y=450, w=300, h=152 (Overlap down by 2px)
  placeRect(600, 450, 300, 152, "BUSH");

  // NEW: Crates tucked in the external corners
  placeCrates(750, 400, 1, 1);
  placeCrates(400, 750, 1, 1);

  // Block 2: Mid Range
  placeRect(1100, 1100, 200, 200, "COVER");
  // Bushes around the cover
  placeRect(1300, 1100, 50, 200, "BUSH"); // Right side bush
  placeRect(1100, 1300, 200, 50, "BUSH"); // Bottom side bush

  // Block 3: Outer Bush (Rectangular Strip - HUGE) - REMOVED
  // placeRect(1500, 1500, 400, 150, "BUSH");
  // Hidden crate inside? No user said NO crates inside bushes.
  // So we put crates NEXT to it.
  placeCrates(1500, 1400, 2, 1); // Above

  // Block 4: New Enclave (Far Corners)
  // A small fortress near the edges
  const fc = 1700;
  placeRect(fc, fc - 200, 50, 200, "WALL"); // Vertical
  placeRect(fc - 200, fc, 200, 50, "WALL"); // Horizontal
  placeRect(fc - 150, fc - 150, 150, 150, "BUSH"); // Inside Bush
  placeCrates(fc + 50, fc - 150, 1, 2); // Boxes outside

  // EXTREME CORNERS (User Request: 3 Boxes)
  // "Une dans le coin, une haut gauche, une bas droite"
  // Let's do a small cluster of 3 again but SPACED manually.
  {
    // Extreme corner area is around 1900 offset.
    let ex = 1900.0,
      ey = 1900.0; // Moved closer to edge (was 1850)
    placeCrates(ex, ey, 1, 1); // Center
    placeCrates(ex - 70, ey, 1, 1); // Left/Top-ish depending on quadrant
    placeCrates(ex, ey - 70, 1, 1); // Top/Left-ish
  }
};

// Build 4 Quadrants
buildQuadrant(1, 1, false, false); // Bottom Right
buildQuadrant(1, 1, true, false); // Bottom Left
buildQuadrant(1, 1, false, true); // Top Right
buildQuadrant(1, 1, true, true); // Top Left

// 5. SPAWNS (Edges)
for (let i = 1; i <= 4; i++) {
  MapDataBR.spawns.push({ x: i * 800, y: 200 }); // Top
  MapDataBR.spawns.push({ x: i * 800, y: 3800 }); // Bot
  MapDataBR.spawns.push({ x: 200, y: i * 800 }); // Left
  MapDataBR.spawns.push({ x: 3800, y: i * 800 }); // Right
}

// 6. CLEANUP BUSHES (Remove Bushes inside Bushes)
// We iterate to find fully contained bushes and remove them.
for (let i = MapDataBR.bushes.length - 1; i >= 0; i--) {
  const b1 = MapDataBR.bushes[i];
  // Check against all other bushes
  for (let j = 0; j < MapDataBR.bushes.length; j++) {
    if (i === j) continue;
    const b2 = MapDataBR.bushes[j];

    // Check if b1 is INSIDE b2
    if (
      b1.x >= b2.x &&
      b1.x + b1.w <= b2.x + b2.w &&
      b1.y >= b2.y &&
      b1.y + b1.h <= b2.y + b2.h
    ) {
      // b1 is inside b2. Remove b1.
      MapDataBR.bushes.splice(i, 1);
      break;
    }
  }
}

// 7. CLEANUP CRATES (Remove Crates inside Bushes)
// We iterate backwards to safely splice
for (let i = MapDataBR.crates.length - 1; i >= 0; i--) {
  const c = MapDataBR.crates[i];
  // Check collision with any bush
  for (const b of MapDataBR.bushes) {
    if (
      c.x < b.x + b.w &&
      c.x + c.w > b.x &&
      c.y < b.y + b.h &&
      c.y + c.h > b.y
    ) {
      // Collision detected
      MapDataBR.crates.splice(i, 1);
      break; // Stop checking bushes for this crate
    }
  }
}

module.exports = MapDataBR;
