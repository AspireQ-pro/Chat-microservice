import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Avatar } from "@mui/material";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:5000" : "");

export default function AuthenticatedAvatar({ src, children, ...props }) {
  const token = useSelector((state) => state.auth.token);
  const [resolvedSrc, setResolvedSrc] = useState(null);
  const avatarRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      return undefined;
    }

    // Existing external profile images remain ordinary image URLs. Chat media
    // endpoints require the same bearer token as messages and attachments.
    if (!API || !String(src).startsWith(`${API}/api/`)) {
      setResolvedSrc(src);
      return undefined;
    }

    if (!token) {
      setResolvedSrc(null);
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl;
    setResolvedSrc(null);
    const loadAvatar = () => {
      fetch(src, {
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
