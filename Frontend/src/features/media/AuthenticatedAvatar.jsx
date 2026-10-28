import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Avatar } from "@mui/material";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:5000" : "");

// Returns true if the URL is served by our own backend and requires the auth header.
// We match both the configured API origin and any URL whose path starts with /api/
// (which covers cases where BACKEND_URL on the server uses a different hostname than
// VITE_API_URL on the frontend, e.g. localhost vs a public IP).
function isBackendMediaUrl(src) {
  if (!src) return false;
  try {
    const url = new URL(String(src));
    if (API && url.origin === new URL(API).origin && url.pathname.startsWith("/api/")) return true;
    // Fallback: same-origin relative URLs, or any absolute URL whose path is /api/*
    if (url.pathname.startsWith("/api/")) return true;
  } catch {
    // relative URL
    if (String(src).startsWith("/api/")) return true;
  }
  return false;
}

export default function AuthenticatedAvatar({ src, children, ...props }) {
  const token = useSelector((state) => state.auth.token);
  const [resolvedSrc, setResolvedSrc] = useState(null);
  const avatarRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      return undefined;
    }

    // External images (e.g. legacy profile pics from a different CDN) are loaded
    // directly. Backend media endpoints require the Bearer token.
    if (!isBackendMediaUrl(src)) {
      setResolvedSrc(src);
      return undefined;
    }

    if (!token) {
      setResolvedSrc(null);
      return undefined;
    }

    // Build the fetch URL: if src is an absolute URL from a different origin than
    // what the browser thinks is the API, rewrite the origin to VITE_API_URL so
    // the request goes to the actual reachable server.
    let fetchUrl = src;
    if (API) {
      try {
        const u = new URL(String(src));
        const apiOrigin = new URL(API).origin;
        if (u.origin !== apiOrigin) {
          fetchUrl = `${apiOrigin}${u.pathname}${u.search}`;
        }
      } catch { /* leave fetchUrl as-is */ }
    }

    const controller = new AbortController();
    let objectUrl;
    setResolvedSrc(null);
    const loadAvatar = () => {
      fetch(fetchUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("Unable to load avatar");
          return response.blob();
        })
        .then((blob) => {
          objectUrl = URL.createObjectURL(blob);
          if (!controller.signal.aborted) setResolvedSrc(objectUrl);
        })
        .catch((error) => {
          if (error.name !== "AbortError") console.error(error);
        });
    };

    let observer;
    if (typeof IntersectionObserver === "undefined" || !avatarRef.current) {
      loadAvatar();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadAvatar();
        }
      }, { rootMargin: "128px" });
      observer.observe(avatarRef.current);
    }

    return () => {
      controller.abort();
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);

  return <Avatar ref={avatarRef} src={resolvedSrc || undefined} {...props}>{children}</Avatar>;
}
