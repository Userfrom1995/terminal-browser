use super::super::{ScrollProfile, ScrollState, Segment};

/// Chrome's wheel curve: every detent retargets one fixed-length hermite
/// flight that enters at the current velocity and lands at rest.
const FLIGHT: f32 = 0.18;

#[derive(Debug, Clone, Copy)]
pub struct Wheel;

impl ScrollProfile for Wheel {
    fn tick(&self, state: &mut ScrollState, delta: f32, _max: f32) {
        if delta * state.velocity < 0.0 {
            state.velocity = 0.0;
        }
        state.segment = Segment {
            from: state.position,
            to: state.target,
            v0: state.velocity,
            dur: FLIGHT,
            t: 0.0,
        };
    }

    fn step(&self, state: &mut ScrollState, dt: f32, _max: f32) {
        let mut seg = state.segment;
        if seg.dur <= 0.0 {
            state.position = state.target;
            state.velocity = 0.0;
            return;
        }
        seg.t = (seg.t + dt).min(seg.dur);
        let s = seg.t / seg.dur;
        if s >= 1.0 {
            state.position = seg.to;
            state.velocity = 0.0;
            seg.dur = 0.0;
        } else {
            let (s2, s3) = (s * s, s * s * s);
            let h00 = 2.0 * s3 - 3.0 * s2 + 1.0;
            let h10 = s3 - 2.0 * s2 + s;
            let h01 = -2.0 * s3 + 3.0 * s2;
            state.position = h00 * seg.from + h10 * seg.v0 * seg.dur + h01 * seg.to;
            let d00 = 6.0 * s2 - 6.0 * s;
            let d10 = 3.0 * s2 - 4.0 * s + 1.0;
            let d01 = -6.0 * s2 + 6.0 * s;
            state.velocity = (d00 * seg.from + d10 * seg.v0 * seg.dur + d01 * seg.to) / seg.dur;
        }
        state.segment = seg;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scroll::settle;

    #[test]
    fn eases_over_multiple_frames_then_lands_exactly() {
        let mut state = ScrollState::default();
        state.tick_wheel(&Wheel, 120.0, 1000.0);
        let steps = settle(&mut state, &Wheel, 1000.0);
        assert_eq!(state.position, 120.0);
        assert!(steps > 3, "eased over {steps} frames");
    }

    #[test]
    fn retick_mid_flight_keeps_moving_forward() {
        let mut state = ScrollState::default();
        state.tick_wheel(&Wheel, 120.0, 1000.0);
        for _ in 0..3 {
            state.step(&Wheel, 1.0 / 60.0, 1000.0);
        }
        let mut last = state.position;
        state.tick_wheel(&Wheel, 120.0, 1000.0);
        while !state.settled() {
            state.step(&Wheel, 1.0 / 60.0, 1000.0);
            assert!(state.position >= last, "went backwards mid-run");
            last = state.position;
        }
        assert_eq!(state.position, 240.0);
    }

    #[test]
    fn reversal_kills_the_carried_velocity() {
        let mut state = ScrollState::default();
        state.tick_wheel(&Wheel, 120.0, 1000.0);
        while state.position < 80.0 {
            state.step(&Wheel, 1.0 / 60.0, 1000.0);
        }
        state.tick_wheel(&Wheel, -60.0, 1000.0);
        let peak = state.position;
        while !state.settled() {
            state.step(&Wheel, 1.0 / 60.0, 1000.0);
            assert!(state.position <= peak, "overshot against the reversal");
        }
        assert_eq!(state.position, 60.0);
    }
}
