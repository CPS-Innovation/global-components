module.exports = function(eleventyConfig) {
  // Pass through custom CSS files only
  eleventyConfig.addPassthroughCopy({ "src/assets/css": "assets/css" });
  
  // Pass through GOV.UK Frontend assets
  eleventyConfig.addPassthroughCopy({ "node_modules/govuk-frontend/dist/govuk/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.js": "assets/js/govuk-frontend.min.js" });
  eleventyConfig.addPassthroughCopy({ "node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.css": "assets/css/govuk-frontend.min.css" });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};