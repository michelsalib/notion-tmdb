import type { NotionPage } from "backend/src/types";
import { useEffect, useState } from "react";

/**
 * The pages this integration can see, as somewhere to put something new.
 *
 * Two callers, both needing a parent page rather than a database: creating a
 * connector's database, and restoring a backup into a new page. `null` while
 * Notion is still answering.
 *
 * Owned by the *caller* rather than privately by either of them, because
 * whether there is anything to offer decides what the surrounding screen draws.
 * Held inside `CreateDatabase`, it produced two versions of the same fault on
 * the settings page: while the fetch was in flight the component returned `null`
 * under an "or" separator, leaving an "or" dividing nothing; and when Notion
 * returned no shared pages, the separator promised an alternative and was
 * followed only by the prerequisite for it. Neither is something the caller
 * could avoid without knowing this.
 */
export interface SharedPages {
  /** `null` while Notion is still answering. */
  pages: NotionPage[] | null;
  /**
   * The request itself failed.
   *
   * Reported separately because "you have not shared a page with this
   * integration" and "we could not find out" are different things to tell
   * someone, and the second used to be presented as the first: a failed fetch
   * set the list to empty, so a 500 came out as an instruction to go and share
   * a page that was already shared.
   */
  failed: boolean;
}

export function useSharedPages(enabled: boolean): SharedPages {
  const [state, setState] = useState<SharedPages>({
    pages: null,
    failed: false,
  });

  useEffect(() => {
    // Gated by a flag rather than by calling the hook conditionally, which
    // React does not allow: a connector that maps no columns and has no restore
    // panel open has no use for the round trip.
    if (!enabled) {
      return;
    }

    void fetch("/api/pages")
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }

        return response.json();
      })
      .then(({ pages }: { pages: NotionPage[] }) =>
        setState({ pages: pages ?? [], failed: false }),
      )
      .catch(() => setState({ pages: [], failed: true }));
  }, [enabled]);

  return state;
}
