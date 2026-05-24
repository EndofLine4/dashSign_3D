# DashSign 3D — Smoke Test Checklist
Run every item manually in Chrome before pushing to GitHub Pages.
Check each box as you go. Don't deploy with unchecked items.

---

## Pre-test
- [ ] `npm test` passes with 0 failures
- [ ] Live Server is running (`index.html` open in browser)
- [ ] No red errors in the browser console (F12 → Console)

---

## Login
- [ ] Login overlay appears on load
- [ ] Wrong credentials show an error message
- [ ] Correct credentials (Chloe / Uncharted) close the overlay
- [ ] PLAY sign popup appears immediately after login

---

## Start sign
- [ ] PLAY sign image loads correctly
- [ ] Hand landmark dots (yellow) appear on hand canvas bottom-right
- [ ] Signing PLAY (index extended pointing up) starts the game
- [ ] Road starts scrolling after PLAY is confirmed

---

## Driving
- [ ] Road scrolls continuously without visible gaps or seams
- [ ] Arrow left / right steers the car
- [ ] Car does not leave the road (boundary clamping works)
- [ ] Camera smoothly follows car's left-right movement
- [ ] Trees visible on both sides of the road
- [ ] Score and distance display update in the top-left HUD
- [ ] Pause button freezes road and car
- [ ] Resume button restarts movement

---

## Mud obstacle (choice mode)
- [ ] Flash banner appears briefly before mud arrives ("Remember these signs!")
- [ ] Three sign images appear with S / G / P labels — NO word text on images
- [ ] Flash banner hides after ~2 seconds
- [ ] Mud obstacle appears on road
- [ ] Choice popup appears with prompt "Pick GO."
- [ ] Pressing S shows "Try again." feedback
- [ ] Pressing P shows "Try again." feedback
- [ ] Pressing G clears the obstacle and adds 10 to score
- [ ] Road resumes scrolling after correct answer

---

## Snow obstacle (sign-it mode)
- [ ] Snow obstacle appears (light blue/white)
- [ ] Sign-it popup appears with SNOW sign image
- [ ] Webcam activates, hand canvas shows landmarks
- [ ] Signing SNOW (open spread hand) shows "Great signing!"
- [ ] Obstacle clears and score increases by 10
- [ ] Webcam and hand canvas hide after popup closes

---

## Cones obstacle (sign-it mode, bonus)
- [ ] Only appears after bonus obstacles are enabled
- [ ] Three orange cones visible on road
- [ ] Popup shows HELP sign image
- [ ] Signing HELP (closed fist) clears the obstacle

---

## Barricade obstacle (avoid mode)
- [ ] Only appears after bonus obstacles are enabled
- [ ] Red and white striped barricade spans the road
- [ ] "Sign LEFT or RIGHT. Dodge now." prompt appears
- [ ] Signing LEFT moves car left
- [ ] Signing RIGHT moves car right
- [ ] Popup closes and game resumes after dodge

---

## Toll booth — OPEN (sign-it mode)
- [ ] Toll booth structure appears: booth box, two posts, gate bar
- [ ] Gate bar spans road when closed
- [ ] Popup shows OPEN sign image
- [ ] Signing OPEN (spread hand, wide) starts gate animation
- [ ] Gate bar visibly lifts/shrinks
- [ ] Obstacle clears after animation completes

---

## Toll booth — CLOSE (sign-it mode)
- [ ] Gate starts in open (lifted) position
- [ ] Popup shows CLOSE sign image
- [ ] Signing CLOSE (compact hand) clears the obstacle

---

## More obstacles prompt
- [ ] Appears after several obstacles have been passed
- [ ] Shows "More obstacles? Sign MORE or NO."
- [ ] Signing MORE enables cones and barricade
- [ ] Signing NO keeps standard obstacle set
- [ ] Prompt only appears once per session

---

## Voiceover
- [ ] "Voice Off" button visible top-right
- [ ] Clicking it enables voice and changes to "Voice On"
- [ ] Popup prompts are read aloud when voice is on
- [ ] Clicking "Voice On" disables voice

---

## Performance
- [ ] Game runs at 60fps (Chrome DevTools → Performance tab)
- [ ] No memory leaks — FPS stays stable after 2 minutes of play

---

## Pre-deploy
- [ ] All above items checked
- [ ] Tested in Chrome ✓
- [ ] Tested in Safari ✓
- [ ] All asset paths are relative (no localhost:// or file:// paths)
- [ ] Push to GitHub and verify GitHub Pages URL loads correctly
- [ ] All sign images load on the live URL (no broken img icons)
