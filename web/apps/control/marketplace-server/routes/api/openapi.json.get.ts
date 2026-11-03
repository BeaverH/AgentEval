import { defineHandler } from "nitro";
import { apiDocumentation } from "../../api-docs";
export default defineHandler(event => apiDocumentation(event.req));
