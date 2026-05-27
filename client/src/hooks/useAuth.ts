import type { UserAuth } from "@gamenite/shared";
import useLoginContext from "./useLoginContext.ts";
import { useMemo } from "react";

/**
 * Custom hook to get authentication information from within a login context
 * @throws if outside a LoginContext
 * @returns a username/password object that can be sent to the api
 */
export default function useAuth(): UserAuth {
  const context = useLoginContext();
  // This use of `useMemo` is critical, because there are other places in the
  // app where `auth` appears as part of a dependency array (notably most
  // socket-involved hooks that use authentication need `auth` in their
  // dependency array). If we don't use `useMemo` here, those dependency
  // arrays will change whenever the app rerenders and we'll spend all our
  // time connecting and disconnecting sockets until the end of time.
  const auth = useMemo(
    () => ({ username: context.user.username, password: context.pass }),
    [context],
  );
  return auth;
}
