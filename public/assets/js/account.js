// /account — sign in and registration forms.
import { api, validateForm, formValues, phoneRule, emailRule } from "./lib/ui.js";

document.querySelectorAll("[data-account-form]").forEach((form) => {
  const status = form.querySelector("[data-form-status]");
  const btn = form.querySelector("[type=submit]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    if (!validateForm(form, { phone: phoneRule, email: emailRule })) return;
    btn.disabled = true;
    try {
      const v = formValues(form);
      v.password = form.elements.password.value; // never trim passwords
      await api("/api/account/" + form.dataset.accountForm, v);
      location.href = "/account";
    } catch (err) {
      status.className = "form-status bad";
      status.textContent = err.message;
      btn.disabled = false;
    }
  });
});
