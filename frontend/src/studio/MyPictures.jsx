// studio/MyPictures.jsx — "My pictures" (23 Oct 2026): the AI pictures and photos a customer made or uploaded
// before, in any chat or design, to put on a tee again without drawing (or paying for) them again. Tapping one asks
// where it goes (PlaceSheet.jsx). Used as the "My pictures" tab in What to add and as a card in the Assistant.
import { useEffect, useState } from "react";
import myPicturesService from "../services/myPicturesService";
import { imageUrl } from "../utils/imageUrl";
import { PICTURES_CHANGED, matchPictures, pictureLabel, pictureWhen } from "./pictureHelpers";

/**
 *   onPick(p)     a picture was tapped
 *   loggedIn / onLogin   visitors are asked to log in (pictures belong to an account)
 *   find          the customer's words: matching pictures first (the Assistant's card)
 *   limit         show at most this many (the Assistant's card), with "See all" to show the rest
 *   onLoaded()    the list has arrived (the chat scrolls down to show the whole card)
 */
export default function MyPictures({ onPick, loggedIn, onLogin, find = "", limit = 0, onLoaded }) {
  const [state, setState] = useState({ loading: loggedIn, pictures: [], error: "" });
  const [all, setAll] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    myPicturesService
      .list()
      .then((pictures) => alive && setState({ loading: false, pictures, error: "" }))
      .catch(() => alive && setState({ loading: false, pictures: [], error: "Couldn’t load your pictures. Check your connection." }));
    return () => {
      alive = false;
    };
  }, [loggedIn, tries]);
  useEffect(() => {
    const again = () => setTries((n) => n + 1);
    window.addEventListener(PICTURES_CHANGED, again);
    return () => window.removeEventListener(PICTURES_CHANGED, again);
  }, []);
  useEffect(() => {
    if (!state.loading) onLoaded?.();
  }, [state.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loggedIn)
    return (
      <div className="dr-mypics-note">
        <p>Log in to see the pictures you made or uploaded before, and put them on this tee.</p>
        <button type="button" className="dr-add" onClick={onLogin}>
          Log in
        </button>
      </div>
    );
  if (state.loading) return <p className="dr-empty">Loading your pictures…</p>;
  if (state.error)
    return (
      <p className="dr-empty">
        {state.error}{" "}
        <button type="button" className="dr-linkbtn" onClick={() => { setState({ loading: true, pictures: [], error: "" }); setTries((n) => n + 1); }}>
          Try again
        </button>
      </p>
    );
  if (!state.pictures.length) return <p className="dr-empty">Pictures you make with the Assistant or upload show up here, so you can use them on any tee.</p>;

  const sorted = find ? matchPictures(state.pictures, find) : state.pictures;
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  return (
    <div className="dr-mypics">
      <div className="dr-mypics-grid">
        {shown.map((p) => (
          <button key={p.id} type="button" className="dr-mypic" onClick={() => onPick(p)} title={pictureLabel(p)}>
            <span className="dr-mypic-img">
              <img src={imageUrl(p.url, 240)} alt="" loading="lazy" />
            </span>
            <span className="dr-mypic-words">
              <b>{pictureLabel(p)}</b>
              <small>
                {p.kind === "photo" ? "Your photo" : p.style || "AI picture"} · {pictureWhen(p.createdAt)}
              </small>
            </span>
          </button>
        ))}
      </div>
      {shown.length < sorted.length && (
        <button type="button" className="dr-linkbtn dr-mypics-more" onClick={() => setAll(true)}>
          See all {sorted.length}
        </button>
      )}
      <p className="dr-empty">Using one again doesn’t use a picture request.</p>
    </div>
  );
}
