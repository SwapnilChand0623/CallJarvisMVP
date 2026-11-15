# Home simulator

A demo stand-in for a smart home. Props held up to a phone camera stand for
sensor events, and Jarvis calls about them while the home is set to Away.
Everything it records is labelled simulated.

Open **Simulator** in the dashboard menu, signed in.

## The prop map

| Prop | Stands for | What happens |
| --- | --- | --- |
| Red Bull can | Gas stove left on | The stove tile turns on. While Away, Jarvis calls and offers to turn it off. |
| Black box | Car in the driveway | The driveway tile shows a car. While Away, Jarvis calls and offers the porch light. |

Add a scenario by adding a row to `src/lib/home/props.ts`.

## Run a scenario

1. Press **Away**. In Home mode an event is only added to the feed.
2. Press **Start camera** on a phone and allow the camera. Hold a prop in view
   for a few seconds. **Trigger** beside each prop does the same without the
   camera.
3. The event appears in the feed as "Jarvis calls", and the scheduler places
   the call within about 20 seconds.
4. On the call, say "turn off the stove" or "turn on the porch light". The
   tile changes on the page. "Got it" acknowledges the event.
5. **Reset** returns to Home with everything off and no alert waiting.

By voice, Jarvis can also report the home's state, switch a device and set
Home or Away ("I'm heading out").

## How it works

- The page sends a small frame to `POST /api/home/vision` about every two
  seconds, and only when the picture has changed. The server asks Gemini which
  props are visible. Frames are not stored.
- A prop counts after two looks in a row. The page then posts the prop to
  `POST /api/home`, which records a `home_events` row.
- While Away the event is critical and eligible for outreach, so the scheduler
  treats it like a critical reminder and places a FaceTime call. The call's
  attempt names the event, and Jarvis is told what it is and what to offer.
- The same event type can alert once every two minutes.

## Setup

- Apply `supabase/migrations/20261115140000_home_simulator.sql`. It adds the
  Home or Away mode and lets a device be a stove.
- Set `GEMINI_API_KEY` on the web server for the camera. Without it the
  Trigger buttons still work.
- The account needs a verified phone and FaceTime outreach, as for reminders.

The first visit creates a simulated stove and porch light for the account.

## Live camera on alert calls

A call about a critical home alert is placed as a FaceTime Video call. While it is ringing or in progress, the
simulator page (with its camera started) joins the call's LiveKit room with a publish-only token from
`POST /api/home/camera` and streams a 320-pixel-wide, 12 fps copy of the camera. The worker relays those frames
onto its own video track at 320x180, because FaceTime shows only the worker's video. Without a camera the call
shows Jarvis's avatar.

- Run the camera on a different device from the phone that takes the call: a phone pauses its camera when FaceTime rings.
- If the line refuses a video call, the alert is placed again as an audio call.
- `ALERT_VIDEO=0` on `web` turns this off, and alert calls go back to audio.
- The video passes through LiveKit and FaceTime live. Nothing is recorded or stored.

### Asking to see the camera

On a FaceTime Video call the user places, "show me the camera" makes Jarvis call `showCamera`. The request is
recorded against that call, the simulator page finds it on its next check (every 2 seconds) and streams into the
call's room, and the worker's video switches from the avatar to the camera. "Hide the camera" or the end of the
call stops it. A request lapses after 15 minutes if a call's end was never recorded. The Simulator's camera must
already be started: a browser cannot be switched on remotely.

Chert does not pass the caller's number to the worker, so any caller is treated as the demo user and can ask for
the camera while the Simulator's camera is on. Stop the camera on the Simulator page to prevent that.
