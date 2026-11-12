import { FIXED_TAG_HINT } from '../../format/explain';

// PRE:  descriptionId is a document-unique id; whatever the tag sits in may point its
//       aria-describedby at it
// POST: renders the "Fixed" tag with FIXED_TAG_HINT as its tooltip, plus the same hint as a hidden
//       element with descriptionId, so assistive technology can read it as a description (WI-42)
export function FixedTag({ descriptionId }: { descriptionId: string }) {
  return (
    <>
      <span className="tag" title={FIXED_TAG_HINT} aria-describedby={descriptionId}>
        Fixed
      </span>
      <span id={descriptionId} hidden>
        {FIXED_TAG_HINT}
      </span>
    </>
  );
}
