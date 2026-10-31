import test from "node:test";
import assert from "node:assert/strict";
import { getPublicMembershipPlan } from "../services/membership.service.js";
import { getVideoDurationLimitSeconds } from "../services/video-duration.service.js";

test("Reel duration limits follow the server-authoritative membership plan", () => {
  const expected = {
    free: 180,
    premium: 300,
    business: 900,
    elite: 1800,
  };

  for (const [planId, seconds] of Object.entries(expected)) {
    assert.equal(
      getVideoDurationLimitSeconds("post", getPublicMembershipPlan(planId)),
      seconds,
      `${planId} Reel duration limit`,
    );
  }
});

test("status videos keep their fixed three-minute limit on every membership plan", () => {
  for (const planId of ["free", "premium", "business", "elite"]) {
    assert.equal(
      getVideoDurationLimitSeconds("status", getPublicMembershipPlan(planId)),
      180,
    );
  }
});

test("duration policy fails closed when a membership duration limit is unavailable", () => {
  assert.equal(getVideoDurationLimitSeconds("post", null), null);
  assert.equal(getVideoDurationLimitSeconds("post", {}), null);
  assert.equal(getVideoDurationLimitSeconds("post", { reelDurationSeconds: 0 }), null);
});
