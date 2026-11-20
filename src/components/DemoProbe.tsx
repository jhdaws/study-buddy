"use client";

// DEMO ONLY (Sprint 4 report and video): a request over plain http, which
// Semgrep's react-insecure-request rule reports as an ERROR, so the CI
// security stage fails this pull request. Never merged.
import { useEffect } from "react";

export default function DemoProbe() {
  useEffect(() => {
    fetch("http://example.com/api/status");
  }, []);
  return null;
}
