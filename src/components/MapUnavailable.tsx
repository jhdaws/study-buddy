/**
 * What /sessions shows in place of the map when there cannot be one (M4):
 * a deployment with no Google key (CI, Vercel previews), or a Maps script
 * that failed to load or refused the key. The wording comes from
 * src/lib/errors.ts, never from Google.
 *
 * The list is unaffected either way, so this offers it. No hooks: it renders
 * from <SessionBrowser> before the map's chunk is ever fetched, and from
 * <SessionMap> once it has failed.
 */

import Icon from "@/components/ui/Icon";
import { BUTTON_SECONDARY, PANEL } from "@/components/ui/styles";
import {
  MAP_UNAVAILABLE_TITLE,
  mapUnavailableMessage,
  type MapUnavailableReason,
} from "@/lib/errors";

export type MapUnavailableProps = {
  reason: MapUnavailableReason;
  /** Switches back to the list; the button is left out without it. */
  onShowList?: () => void;
};

export default function MapUnavailable({ reason, onShowList }: MapUnavailableProps) {
  return (
    <section
      aria-labelledby="map-unavailable"
      data-reason={reason}
      className={`${PANEL} px-5 py-8 text-center`}
    >
      <Icon name="pin" className="mx-auto size-6 text-ink-2" />
      <h2 id="map-unavailable" className="mt-2 text-[17px] font-bold text-ink">
        {MAP_UNAVAILABLE_TITLE}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-2">{mapUnavailableMessage(reason)}</p>
      {onShowList && (
        <button type="button" onClick={onShowList} className={`${BUTTON_SECONDARY} mt-5`}>
          Show the list
        </button>
      )}
    </section>
  );
}
