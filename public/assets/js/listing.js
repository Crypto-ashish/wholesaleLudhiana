// Listing pages: submit the filter form as soon as a filter or sort option changes.
document.querySelectorAll("[data-autosubmit]").forEach((form) => {
  form.addEventListener("change", () => {
    for (const el of form.querySelectorAll("select")) if (!el.value || el.value === "featured") el.disabled = true; // keep URLs clean
    form.submit();
  });
});
