import { useCallback, useEffect, useState } from "react";
import type { SafeUserInfo } from "@gamenite/shared";
import useAuth from "./useAuth.ts";
import useLoginContext from "./useLoginContext.ts";
import {
  follow as followApi,
  listFollowing,
  unfollow as unfollowApi,
} from "../services/followService.ts";

/**
 * The signed-in viewer's follow graph + actions. Loads the viewer's following
 * list once, and follow/unfollow optimistically update it from the server's
 * response (both endpoints return the updated following list). Drives
 * Follow/Following buttons anywhere a user is listed.
 */
export default function useFollow() {
  const auth = useAuth();
  const { user } = useLoginContext();
  const [following, setFollowing] = useState<SafeUserInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listFollowing(user.username)
      .then((list) => {
        if (active) setFollowing(list);
      })
      .catch(() => {
        /* best-effort: empty until it loads */
      });
    return () => {
      active = false;
    };
  }, [user.username]);

  const follow = useCallback(
    async (username: string) => {
      setBusy(username);
      try {
        setFollowing(await followApi(username, auth));
      } finally {
        setBusy(null);
      }
    },
    [auth],
  );

  const unfollow = useCallback(
    async (username: string) => {
      setBusy(username);
      try {
        setFollowing(await unfollowApi(username, auth));
      } finally {
        setBusy(null);
      }
    },
    [auth],
  );

  const isFollowing = useCallback(
    (username: string) => following.some((u) => u.username === username),
    [following],
  );

  return { following, follow, unfollow, isFollowing, busy };
}
