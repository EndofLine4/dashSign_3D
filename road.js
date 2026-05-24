// =============================================================
// road.js
// Creates and animates the infinite scrolling road.
// Two long road tiles leapfrog each other to create the
// illusion of continuous forward motion — same logic as the
// 2D version but along the Z axis instead of Y.
// =============================================================

import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────
// ROAD_LENGTH: how long each tile is in 3D units.
// Two tiles cover 2x this length, which is always enough to
// fill the camera's view without a visible seam.
export const ROAD_LENGTH = 80;
export const ROAD_WIDTH  = 14;  // wide enough for 3 lanes


// =============================================================
// createRoad
// Builds two road tile meshes and adds them to the scene.
// Also adds lane markers and road edge lines.
// Returns the two tile meshes so updateRoad can scroll them.
// =============================================================
export function createRoad(scene) {
  const loader = new THREE.TextureLoader();

  // Try to load the Kenney road texture — falls back to flat gray
  // if the image isn't found (useful during early dev)
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2d2d2d });
  loader.load(
    'signs/road_asphalt01.png',
    function(tex) {
      // Tile the texture to repeat along the road length
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 16);
      roadMat.map = tex;
      roadMat.needsUpdate = true;
    }
  );

  const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.2, ROAD_LENGTH);

  // Tile 1 starts at z=0, Tile 2 starts directly behind it
  const tile1 = new THREE.Mesh(roadGeo, roadMat);
  const tile2 = new THREE.Mesh(roadGeo, roadMat);
  tile1.position.set(0, 0, 0);
  tile2.position.set(0, 0, -ROAD_LENGTH);
  tile1.receiveShadow = true;
  tile2.receiveShadow = true;

  scene.add(tile1, tile2);

  // Lane markers and edge lines sit on top of the road tiles
  addLaneMarkers(scene);
  addRoadEdges(scene);

  return [tile1, tile2];
}


// =============================================================
// updateRoad
// Called every frame. Moves both tiles toward the camera (+Z).
// When a tile passes the camera it teleports back to the start
// of the queue — this is the infinite loop trick.
// =============================================================
export function updateRoad(tiles, speed) {
  tiles.forEach(function(tile) {
    tile.position.z += speed;
    // Once a tile has fully passed the camera, jump it back
    if (tile.position.z > ROAD_LENGTH) {
      tile.position.z -= ROAD_LENGTH * 2;
    }
  });
}


// =============================================================
// addLaneMarkers
// Creates white dashed lines down the center of the road.
// Each marker is a thin flat box. They're static — the road
// tiles scrolling underneath them gives the appearance of
// moving markers without needing to animate them separately.
// =============================================================
function addLaneMarkers(scene) {
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const markerGeo = new THREE.BoxGeometry(0.15, 0.21, 2.5);

  // Spread 24 markers across two road tile lengths
  for (let i = 0; i < 24; i++) {
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(0, 0.01, -i * 7);
    scene.add(marker);
  }
}


// =============================================================
// addRoadEdges
// White lines along the left and right edges of the road.
// Long single boxes that span both road tiles combined.
// =============================================================
function addRoadEdges(scene) {
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const edgeGeo = new THREE.BoxGeometry(0.2, 0.22, ROAD_LENGTH * 2);

  const leftEdge  = new THREE.Mesh(edgeGeo, edgeMat);
  const rightEdge = new THREE.Mesh(edgeGeo, edgeMat);
  leftEdge.position.set(-(ROAD_WIDTH / 2) + 0.5, 0.01, -ROAD_LENGTH / 2);
  rightEdge.position.set((ROAD_WIDTH / 2) - 0.5,  0.01, -ROAD_LENGTH / 2);

  scene.add(leftEdge, rightEdge);
}
