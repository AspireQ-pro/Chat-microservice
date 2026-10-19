import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setAuth } from "@/provider/authSlice";

function decodeToken(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function resolveUserCapabilities(decoded) {
  if (!decoded) {
    return { allowGroupChat: true, allowDirectChat: true };
  }

  let allowGroup;
  if (decoded.allowGroupChat !== undefined) {
    allowGroup = Boolean(decoded.allowGroupChat);
  } else if (decoded.groupChat !== undefined) {
    allowGroup = Boolean(decoded.groupChat);
  } else if (decoded.plan === "basic") {
    allowGroup = true;
  } else {
    allowGroup = true;
  }

  let allowDirect;
  if (decoded.allowDirectChat !== undefined) {
    allowDirect = Boolean(decoded.allowDirectChat);
  } else if (decoded.allowIndividualChat !== undefined) {
    allowDirect = Boolean(decoded.allowIndividualChat);
  } else if (decoded.individualChat !== undefined) {
    allowDirect = Boolean(decoded.individualChat);
  } else if (decoded.directChat !== undefined) {
    allowDirect = Boolean(decoded.directChat);
  } else if (decoded.oneToOneChat !== undefined) {
    allowDirect = Boolean(decoded.oneToOneChat);
  } else if (decoded.plan === "basic") {
    allowDirect = false;
  } else {
    allowDirect = true;
  }

  return {
    allowGroupChat: allowGroup,
    allowDirectChat: allowDirect,
  };
}

export function useSSOAuth() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const token = useSelector((s) => s.auth.token);
  const loading = useSelector((s) => s.auth.loading);
  const error = useSelector((s) => s.auth.error);

  useEffect(() => {
    if (user && token) return;

    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");

    if (!tokenFromUrl) {
      if (import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_LOGIN === "true") {
        dispatch(
          setAuth({
            token: "dev-mock-token",
            user: {
              id: import.meta.env.VITE_DEV_USER_ID || "dev-user-001",
              name: import.meta.env.VITE_DEV_USER_NAME || "Dev User",
              email: import.meta.env.VITE_DEV_USER_EMAIL || "dev@example.com",
              plan: import.meta.env.VITE_DEV_PLAN || "custom",
              allowGroupChat: import.meta.env.VITE_DEV_ALLOW_GROUP_CHAT !== "false",
              allowDirectChat: import.meta.env.VITE_DEV_ALLOW_DIRECT_CHAT !== "false",
            },
          }),
        );
      }
      return;
    }

    params.delete("token");
    const newSearch = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (newSearch ? `?${newSearch}` : ""),
    );

    const decoded = decodeToken(tokenFromUrl);
    const { allowGroupChat, allowDirectChat } = resolveUserCapabilities(decoded);

    dispatch(
      setAuth({
        token: tokenFromUrl,
        user: {
          id: decoded?.userId,
          name: decoded?.name,
          email: decoded?.email,
          plan: decoded?.plan || "custom",
          allowGroupChat,
          allowDirectChat,
        },
      }),
    );
  }, [dispatch, user, token]);

  useEffect(() => {
    const handleSessionRefresh = (event) => {
      const expectedOrigin = import.meta.env.VITE_SOCIETY_ORIGIN
        ? new URL(import.meta.env.VITE_SOCIETY_ORIGIN).origin
        : document.referrer
          ? new URL(document.referrer).origin
          : null;
      if (!expectedOrigin || event.origin !== expectedOrigin) return;
      if (event.source !== window.parent) return;
      if (event.data?.source !== "society-management") return;
      if (event.data?.type !== "chat:session-token") return;
      if (typeof event.data?.token !== "string") return;

      const refreshedUser = decodeToken(event.data.token);
      if (!refreshedUser?.userId || !refreshedUser?.projectId) return;
      const { allowGroupChat, allowDirectChat } = resolveUserCapabilities(refreshedUser);

      dispatch(
        setAuth({
          token: event.data.token,
          user: {
            id: refreshedUser.userId,
            name: refreshedUser.name,
            email: refreshedUser.email,
            plan: refreshedUser.plan || "custom",
            allowGroupChat,
            allowDirectChat,
          },
        }),
      );
    };

    window.addEventListener("message", handleSessionRefresh);
    return () => window.removeEventListener("message", handleSessionRefresh);
  }, [dispatch]);

  return { user, token, loading, error };
}
