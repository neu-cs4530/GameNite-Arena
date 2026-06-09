import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../ui/Button.tsx";
import { getHelloWorldTemplate } from "../../services/modelService.ts";

interface HelloWorldTemplateButtonProps {
  /** Optional intercept used by the new-run form when it's already mounted. */
  onLoad?: (template: { source: string; name: string }) => void;
  /** Variant override. */
  variant?: "primary" | "secondary" | "ghost";
}

/**
 * Loads the canned starter template (Story 2.12). If `onLoad` is omitted,
 * the button navigates to `/trainer/new?fromTemplate=hello-world` so the
 * form page can pick it up.
 */
export default function HelloWorldTemplateButton({
  onLoad,
  variant = "secondary",
}: HelloWorldTemplateButtonProps): JSX.Element {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function click() {
    if (onLoad) {
      setLoading(true);
      try {
        const template = await getHelloWorldTemplate();
        onLoad(template);
      } finally {
        setLoading(false);
      }
    } else {
      void navigate("/trainer/new?fromTemplate=hello-world");
    }
  }

  return (
    <Button
      variant={variant}
      loading={loading}
      onClick={click}
      data-testid="hello-world-template-button"
    >
      Start from hello world template
    </Button>
  );
}
