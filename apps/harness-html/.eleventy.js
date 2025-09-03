import { HtmlBasePlugin } from "@11ty/eleventy";
import replace from "stream-replace-string";

export default function (eleventyConfig) {
  // Pass through custom CSS files only
  eleventyConfig.addPassthroughCopy({ "src/assets/css": "assets/css" });

  // Pass through GOV.UK Frontend assets
  eleventyConfig.addPassthroughCopy({
    "node_modules/govuk-frontend/dist/govuk/assets": "assets",
  });
  eleventyConfig.addPassthroughCopy({
    "node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.js":
      "assets/js/govuk-frontend.min.js",
  });

  eleventyConfig.addPassthroughCopy(
    {
      "node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.css":
        "assets/css/govuk-frontend.min.css",
    },
    {
      transform: function () {
        return replace(
          "url(/assets/",
          `url(${process.env.BASE_PATH || ""}/assets/`
        );
      },
    }
  );

  eleventyConfig.addPassthroughCopy({
    "src/assets/cps-global-components.js": "assets/cps-global-components.js",
    "src/assets/cps-global-components.js.map":
      "assets/cps-global-components.js.map",
    "src/assets/config.json": "assets/config.json",
    "src/assets/config.override.json": "assets/config.override.json",
  });

  eleventyConfig.setServerOptions({ port: 3333 });
  eleventyConfig.addPlugin(HtmlBasePlugin);

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    pathPrefix: process.env.BASE_PATH,
  };
}
