import { z } from "zod";
import xss from "xss";

// Custom Zod string schema that automatically sanitizes inputs to prevent XSS
export const sanitizedString = () => z.string().transform((str) => xss(str));
