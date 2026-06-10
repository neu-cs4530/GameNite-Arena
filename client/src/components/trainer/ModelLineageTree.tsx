import "./ModelLineageTree.css";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { ModelSummary } from "../../util/types.ts";

interface ModelLineageTreeProps {
  self: { id: string; displayName: string };
  ancestors: ModelSummary[];
  descendants: ModelSummary[];
}

/** Mini lineage graph: ancestor chain -> self -> descendants. */
export default function ModelLineageTree({
  self,
  ancestors,
  descendants,
}: ModelLineageTreeProps): JSX.Element {
  return (
    <div className="ga-lineage" data-testid="model-lineage-tree">
      <div className="ga-lineage__row">
        {ancestors
          .slice()
          .reverse()
          .map((a) => (
            <span key={a.id} className="ga-lineage__row">
              <Link to={`/models/${a.id}`} className="ga-lineage__node">
                {a.displayName}
              </Link>
              <span className="ga-lineage__caret" aria-hidden="true">
                →
              </span>
            </span>
          ))}
        <span className="ga-lineage__node ga-lineage__node--self" data-testid="lineage-self">
          {self.displayName}
        </span>
      </div>
      {descendants.length > 0 && (
        <div className="ga-lineage__row">
          <span className="ga-lineage__caret" aria-hidden="true">
            forks ↓
          </span>
          <div className="ga-lineage__descendants" data-testid="lineage-descendants">
            {descendants.map((d) => (
              <Link key={d.id} to={`/models/${d.id}`} className="ga-lineage__node">
                {d.displayName}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
