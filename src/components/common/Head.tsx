import { useEffect, ReactNode } from "react";

interface HeadProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

const Head = ({ title, description, children }: HeadProps) => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement("meta");
        metaDescription.setAttribute("name", "description");
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute("content", description);
    }

    return () => {
      document.title = previousTitle;
    };
  }, [title, description]);

  useEffect(() => {
    return () => {};
  }, [children]);

  return null;
};

export default Head;
