/**
 * Publisher registry — each module exports async publish(postData) -> { url }.
 * postData = { title, markdownBody, excerpt, tags, canonicalUrl, coverImageUrl }
 *
 * Extension point for later: hashnode/medium can be added here as siblings
 * once they're feasible again (Hashnode currently requires a Pro-plan
 * publication for API access; Medium no longer issues new integration
 * tokens) — no other code needs to change to add them.
 */
module.exports = {
  devto: require("./devto"),
};
