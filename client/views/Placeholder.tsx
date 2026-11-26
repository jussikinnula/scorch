import React from "react";

interface Props {
  title: string;
  /** The room or the token of the address, shown to tell that the route works. */
  id: string;
}

/** A view that is not made yet: it only tells what will be here. */
export default function Placeholder({ title, id }: Props) {
  return (
    <section className="view">
      <h2>{title}</h2>
      <p>
        This view has not been made yet. Id: <code>{id}</code>
      </p>
      <p>
        <a href="#/">To the front page</a>
      </p>
    </section>
  );
}
