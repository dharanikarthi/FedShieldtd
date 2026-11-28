"""Plain-language reason codes for alerts (fraud-officer facing)."""
import math

PCT = lambda v: f"{v * 100:.0f}%"
NUM = lambda v: f"{v:,.0f}"
INR = lambda v: f"₹{v:,.0f}"
DAYS = lambda v: f"{v:,.0f} days"

# feature -> (label, formatter, sentence when it RAISES risk)
TEMPLATES = {
    "bidir_ratio": ("Two-way counterparties", PCT, "Only {v} of counterparties are two-way (typical {m}): money flows in from one set and out to another, the funnel shape of a mule account."),
    "n_bidir": ("Two-way counterparties (count)", NUM, "{v} two-way counterparties (typical {m})."),
    "n_cp_in": ("Distinct senders", NUM, "Received from {v} distinct senders (typical {m}): fan-in."),
    "n_cp_out": ("Distinct beneficiaries", NUM, "Paid out to {v} distinct beneficiaries (typical {m})."),
    "fan_in_out_ratio": ("Fan-in / fan-out", lambda v: f"{v:.1f}×", "Senders outnumber beneficiaries {v} (typical {m}): many-to-few aggregation."),
    "passthrough_48h": ("Funds drained within 48h", PCT, "{v} of incoming money left within 48 hours (typical {m}): rapid pass-through."),
    "passthrough_sameday": ("Same-day pass-through", PCT, "{v} of credits were debited the same day (typical {m})."),
    "passthrough_ratio": ("Debit/credit balance", PCT, "Outflow matched {v} of inflow (typical {m}): the account keeps almost nothing."),
    "balance_drain": ("Balance drain", PCT, "Balance repeatedly drained toward zero (score {v}, typical {m})."),
    "near_zero_bal_share": ("Near-zero balance", PCT, "Balance was under ₹1,000 after {v} of transactions (typical {m})."),
    "max_gap_days": ("Longest dormancy", DAYS, "Account was silent for {v} before activity resumed (typical {m})."),
    "txn_after_dormancy": ("Activity after dormancy", NUM, "{v} transactions in the 30 days after waking from dormancy (typical {m})."),
    "struct_50k_share": ("Just-below-₹50k amounts", PCT, "{v} of transactions were between ₹45,000 and ₹50,000 (typical {m}): structuring below the PAN threshold."),
    "n_struct_50k": ("Just-below-₹50k count", NUM, "{v} transactions just below ₹50,000 (typical {m})."),
    "round_1k_share": ("Round amounts", PCT, "{v} of amounts were exact multiples of ₹1,000 (typical {m})."),
    "mobile_spike_ratio": ("Post-mobile-change spike", lambda v: f"{v:.1f}×", "Activity rose {v} in the 60 days after the mobile number changed (typical {m}): possible account takeover."),
    "days_since_mobile_update": ("Mobile number changed", DAYS, "Mobile number changed {v} ago (typical {m})."),
    "account_age_days": ("Account age", DAYS, "Account is {v} old (typical {m})."),
    "volume_to_balance": ("Volume vs balance", lambda v: f"{v:.0f}×", "Monthly inflow is {v} the average balance (typical {m}): income mismatch."),
    "n_ip": ("Distinct IPs/devices", NUM, "Used from {v} distinct IP addresses (typical {m})."),
    "geo_spread": ("Geographic spread", lambda v: f"{v:.2f}°", "Transactions spread over {v} of latitude/longitude (typical {m}): geographic anomaly."),
    "n_locations": ("Distinct locations", NUM, "Transacted from {v} distinct locations (typical {m})."),
    "night_share": ("Night activity", PCT, "{v} of transactions happened between 11pm and 5am (typical {m})."),
    "ch_upi_credit": ("UPI credits", PCT, "{v} of transactions were incoming UPI (typical {m})."),
    "ch_atm_wd": ("ATM withdrawals", PCT, "{v} of transactions were ATM cash-outs (typical {m})."),
    "ch_imps": ("IMPS share", PCT, "{v} of transactions used IMPS (typical {m})."),
    "top_beneficiary_share": ("Top-beneficiary concentration", PCT, "{v} of outflow went to a single beneficiary (typical {m})."),
    "txn_velocity": ("Transaction velocity", lambda v: f"{v:.1f}/day", "{v} transactions per day (typical {m})."),
    "burst_ratio": ("Burst intensity", lambda v: f"{v:.1f}×", "Busiest day had {v} the usual daily volume (typical {m})."),
    "reg_cp_rare": ("Shared rare counterparties", lambda v: f"{v:.2f}", "Shares rare counterparties with mules confirmed at consortium banks (score {v}, typical {m})."),
    "reg_cp_flagged": ("Counterparties linked to confirmed mules", NUM, "{v} counterparties also transact with confirmed mules at consortium banks (typical {m})."),
    "reg_cp_share": ("Share of flagged counterparties", PCT, "{v} of counterparties are in the consortium suspect registry (typical {m})."),
    "reg_ip_shared_mule": ("Device shared with a confirmed mule", NUM, "Shares {v} IP addresses/devices with confirmed mule accounts (typical {m})."),
    "kyc_compliant": ("KYC compliant", lambda v: "yes" if v >= 0.5 else "no", "KYC compliant: {v}."),
    "days_since_kyc": ("Days since KYC", DAYS, "Last KYC was {v} ago (typical {m})."),
    "unique_channels": ("Channels", NUM, "{v} channels used (typical {m})."),
    "n_channels": ("Channels used", NUM, "Used {v} payment channels (typical {m})."),
    "n_txn": ("Transactions", NUM, "{v} transactions in the window (typical {m})."),
    "sum_credit": ("Total credits", INR, "{v} received in the window (typical {m})."),
    "txn_per_cp": ("Transactions per counterparty", lambda v: f"{v:.1f}", "Only {v} transactions per counterparty (typical {m}): many one-off parties, typical of mule collection."),
    "n_cp": ("Distinct counterparties", NUM, "Dealt with {v} distinct counterparties (typical {m})."),
    "active_day_density": ("Active-day density", PCT, "Active on {v} of days in its lifetime (typical {m}): short bursts, then silence."),
    "span_days": ("Active lifetime", DAYS, "All activity fits in {v} (typical {m})."),
    "active_days": ("Active days", NUM, "Active on {v} days (typical {m})."),
    "ch_pos": ("Card (POS) spend", PCT, "{v} of transactions were card purchases (typical {m}): little normal everyday spending."),
    "ch_neft": ("NEFT share", PCT, "{v} of transactions used NEFT (typical {m})."),
    "ch_fund_transfer": ("Fund-transfer share", PCT, "{v} of transactions were fund transfers (typical {m})."),
    "round_5k_share": ("Round ₹5,000 amounts", PCT, "{v} of amounts were exact multiples of ₹5,000 (typical {m})."),
    "mh_max_night_1d": ("Peak night transactions", NUM, "Up to {v} night-time (11pm-7am) transactions in a single day (typical {m})."),
    "mh_night_share_23_07": ("Night activity", PCT, "{v} of transactions between 11pm and 7am (typical {m})."),
    "mh_max_txn_1d": ("Peak transactions in a day", NUM, "Up to {v} transactions in a single day (typical {m})."),
    "mh_max_txn_1h": ("Peak transactions in an hour", NUM, "Up to {v} transactions within one hour (typical {m})."),
    "mh_max_txn_7d": ("Peak transactions in a week", NUM, "Up to {v} transactions in one week (typical {m})."),
    "mh_max_credit_amt_1d": ("Peak credits in a day", INR, "Received up to {v} in a single day (typical {m})."),
    "mh_max_credit_amt_7d": ("Peak credits in a week", INR, "Received up to {v} in one week (typical {m})."),
    "mh_max_debit_amt_1d": ("Peak debits in a day", INR, "Paid out up to {v} in a single day (typical {m})."),
    "mh_conc_credit_3m_max": ("Credits within 3 minutes", NUM, "Up to {v} credits landed within 3 minutes of each other (typical {m}): coordinated collection."),
    "mh_conc_credit_15m_max": ("Credits within 15 minutes", NUM, "Up to {v} credits within 15 minutes (typical {m})."),
    "mh_conc_debit_3m_max": ("Debits within 3 minutes", NUM, "Up to {v} debits within 3 minutes (typical {m}): rapid cash-out."),
    "mh_sum_digit_mean": ("Amount digit pattern", lambda v: f"{v:.1f}", "Unusual amount digit pattern (digit-sum {v}, typical {m})."),
    "mh_sum_digit_std": ("Amount digit spread", lambda v: f"{v:.1f}", "Unusual spread in amount digits ({v}, typical {m})."),
    "mh_mean_unique_party_month": ("New parties per month", lambda v: f"{v:.1f}", "About {v} distinct parties per month (typical {m})."),
    "mh_max_unique_party_week": ("Peak new parties in a week", NUM, "Up to {v} distinct parties in a single week (typical {m})."),
    "mh_max_upi_1d": ("Peak UPI in a day", NUM, "Up to {v} UPI transactions in one day (typical {m})."),
    "reg_cp_links": ("Links to registry accounts", NUM, "{v} links to accounts in the consortium registry (typical {m})."),
    "branch_employee_count": ("Branch size", NUM, "Opened at a branch with {v} staff (typical {m})."),
    "credit_debit_ratio": ("Credit/debit ratio", lambda v: f"{v:.2f}", "Credit-to-debit ratio of {v} (typical {m})."),
    "dormancy_wake_intensity": ("Wake-up intensity", lambda v: f"{v:.1f}×", "Activity jumped {v} on waking from dormancy (typical {m})."),
}


def _humanize(f):
    """Readable fallback label for features without a hand-written template."""
    w = {"mh": "", "max": "peak", "txn": "transactions", "cp": "counterparties", "amt": "amount", "ch": "",
         "conc": "concurrent", "1d": "per day", "7d": "per week", "1h": "per hour", "12h": "per 12h",
         "n": "number of", "bal": "balance", "upi": "UPI", "imps": "IMPS", "neft": "NEFT", "atm": "ATM", "mcc": "MCC"}
    out = " ".join(w.get(t, t) for t in f.split("_")).strip()
    return (out[:1].upper() + out[1:]) if out else f


def _fmt(fmt, v):
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return "n/a"
        return fmt(v)
    except Exception:
        return str(v)


def explain(features, values, contribs, medians, k=5):
    """Top-k risk-raising reasons, plus the strongest mitigating factor."""
    order = sorted(range(len(features)), key=lambda i: -contribs[i])
    out = []
    for i in order:
        if contribs[i] <= 0 or len(out) >= k:
            break
        f = features[i]
        m = medians.get(f)
        if m is not None and values[i] is not None and abs(float(values[i]) - float(m)) <= 1e-9 * max(1.0, abs(float(m))):
            continue          # value is typical: the effect is an interaction, not a sentence an officer can use
        label, fmt, sent = TEMPLATES.get(f, (_humanize(f), lambda v: f"{v:,.3g}", "{label}: {v} (typical {m})."))
        if m is not None and _fmt(fmt, values[i]) == _fmt(fmt, m):
            continue          # looks identical to "typical" once rounded: not a usable reason
        out.append({"feature": f, "label": label, "value": values[i], "typical": medians.get(f),
                    "impact": float(contribs[i]),
                    "text": sent.format(v=_fmt(fmt, values[i]), m=_fmt(fmt, medians.get(f)), label=label)})
    neg = min(range(len(features)), key=lambda i: contribs[i])
    mitig = None
    if contribs[neg] < 0:
        f = features[neg]
        label, fmt, _ = TEMPLATES.get(f, (_humanize(f), lambda v: f"{v:,.3g}", ""))
        mitig = {"feature": f, "label": label, "impact": float(contribs[neg]),
                 "text": f"Mitigating: {label} = {_fmt(fmt, values[neg])} (typical {_fmt(fmt, medians.get(f))})."}
    return out, mitig


# ----------------------------------------------------------------------------- vernacular reasons
# Branch staff at co-operative banks and RRBs often work in Hindi or Kannada. Same numbers, same
# model; only the sentence changes. Features without a translation fall back to English.
I18N = {
    "hi": {
        "_typical": "सामान्य",
        "bidir_ratio": "केवल {v} लेन-देन पक्ष दोनों तरफ़ के हैं (सामान्य {m}): पैसा एक समूह से आता है और दूसरे को जाता है, यह म्यूल खाते का पैटर्न है।",
        "n_cp_in": "{v} अलग-अलग लोगों से पैसा आया (सामान्य {m})।",
        "n_cp_out": "{v} अलग-अलग लाभार्थियों को भुगतान किया (सामान्य {m})।",
        "fan_in_out_ratio": "भेजने वाले लाभार्थियों से {v} अधिक हैं (सामान्य {m}): कई लोगों से पैसा जमा करके कुछ लोगों को भेजना।",
        "passthrough_48h": "आने वाले पैसे का {v} हिस्सा 48 घंटे में निकल गया (सामान्य {m})।",
        "passthrough_sameday": "{v} जमा राशि उसी दिन निकाल ली गई (सामान्य {m})।",
        "near_zero_bal_share": "{v} लेन-देन के बाद शेष राशि ₹1,000 से कम थी (सामान्य {m})।",
        "max_gap_days": "खाता {v} तक बंद रहा, फिर अचानक सक्रिय हुआ (सामान्य {m})।",
        "struct_50k_share": "{v} लेन-देन ₹45,000 से ₹50,000 के बीच थे (सामान्य {m}): PAN सीमा से बचने के लिए राशि तोड़ना।",
        "n_struct_50k": "₹50,000 से ठीक नीचे {v} लेन-देन (सामान्य {m})।",
        "round_1k_share": "{v} राशियाँ ₹1,000 के पूरे गुणक थीं (सामान्य {m})।",
        "mobile_spike_ratio": "मोबाइल नंबर बदलने के बाद 60 दिनों में गतिविधि {v} बढ़ी (सामान्य {m}): खाता हथियाए जाने की आशंका।",
        "account_age_days": "खाता {v} पुराना है (सामान्य {m})।",
        "volume_to_balance": "मासिक जमा औसत शेष का {v} है (सामान्य {m}): आय से मेल नहीं खाता।",
        "night_share": "{v} लेन-देन रात 11 से सुबह 5 बजे के बीच हुए (सामान्य {m})।",
        "ch_atm_wd": "{v} लेन-देन ATM से नकद निकासी थे (सामान्य {m})।",
        "reg_cp_flagged": "{v} लेन-देन पक्ष अन्य बैंकों के पुष्ट म्यूल खातों से भी जुड़े हैं (सामान्य {m})।",
        "reg_cp_share": "{v} लेन-देन पक्ष संघ की संदिग्ध सूची में हैं (सामान्य {m})।",
        "reg_ip_shared_mule": "पुष्ट म्यूल खातों के साथ {v} IP/डिवाइस साझा हैं (सामान्य {m})।",
        "txn_per_cp": "प्रति पक्ष केवल {v} लेन-देन (सामान्य {m}): बहुत सारे एक-बार के पक्ष, म्यूल संग्रह का संकेत।",
        "n_cp": "{v} अलग-अलग पक्षों से लेन-देन (सामान्य {m})।",
        "active_day_density": "जीवनकाल के केवल {v} दिनों में सक्रिय (सामान्य {m}): अचानक गतिविधि, फिर चुप्पी।",
        "ch_pos": "केवल {v} लेन-देन कार्ड से ख़रीदारी थे (सामान्य {m}): रोज़मर्रा का सामान्य ख़र्च बहुत कम।",
        "mh_max_night_1d": "एक दिन में रात (11 बजे से सुबह 7 बजे) के {v} तक लेन-देन (सामान्य {m})।",
        "mh_max_txn_1d": "एक दिन में {v} तक लेन-देन (सामान्य {m})।",
        "mh_conc_credit_3m_max": "3 मिनट के भीतर {v} तक जमा (सामान्य {m}): संगठित संग्रह।",
        "mh_conc_debit_3m_max": "3 मिनट के भीतर {v} तक निकासी (सामान्य {m}): तेज़ नकदीकरण।",
        "round_5k_share": "{v} राशियाँ ₹5,000 के पूरे गुणक थीं (सामान्य {m})।",
    },
    "kn": {
        "_typical": "ಸಾಮಾನ್ಯ",
        "bidir_ratio": "ಕೇವಲ {v} ವಹಿವಾಟುದಾರರು ಎರಡೂ ದಿಕ್ಕಿನವರು (ಸಾಮಾನ್ಯ {m}): ಹಣ ಒಂದು ಗುಂಪಿನಿಂದ ಬಂದು ಇನ್ನೊಂದಕ್ಕೆ ಹೋಗುತ್ತದೆ, ಇದು ಮ್ಯೂಲ್ ಖಾತೆಯ ಮಾದರಿ.",
        "n_cp_in": "{v} ವಿಭಿನ್ನ ಕಳುಹಿಸುವವರಿಂದ ಹಣ ಬಂದಿದೆ (ಸಾಮಾನ್ಯ {m}).",
        "n_cp_out": "{v} ವಿಭಿನ್ನ ಫಲಾನುಭವಿಗಳಿಗೆ ಪಾವತಿಸಲಾಗಿದೆ (ಸಾಮಾನ್ಯ {m}).",
        "fan_in_out_ratio": "ಕಳುಹಿಸುವವರು ಫಲಾನುಭವಿಗಳಿಗಿಂತ {v} ಹೆಚ್ಚು (ಸಾಮಾನ್ಯ {m}): ಅನೇಕರಿಂದ ಸಂಗ್ರಹಿಸಿ ಕೆಲವರಿಗೆ ಕಳುಹಿಸುವುದು.",
        "passthrough_48h": "ಬಂದ ಹಣದ {v} ಭಾಗ 48 ಗಂಟೆಗಳಲ್ಲಿ ಹೊರಹೋಗಿದೆ (ಸಾಮಾನ್ಯ {m}).",
        "passthrough_sameday": "{v} ಜಮೆಗಳನ್ನು ಅದೇ ದಿನ ಹಿಂಪಡೆಯಲಾಗಿದೆ (ಸಾಮಾನ್ಯ {m}).",
        "near_zero_bal_share": "{v} ವಹಿವಾಟುಗಳ ನಂತರ ಬಾಕಿ ₹1,000 ಕ್ಕಿಂತ ಕಡಿಮೆ ಇತ್ತು (ಸಾಮಾನ್ಯ {m}).",
        "max_gap_days": "ಖಾತೆ {v} ನಿಷ್ಕ್ರಿಯವಾಗಿದ್ದು, ನಂತರ ಹಠಾತ್ತಾಗಿ ಸಕ್ರಿಯವಾಯಿತು (ಸಾಮಾನ್ಯ {m}).",
        "struct_50k_share": "{v} ವಹಿವಾಟುಗಳು ₹45,000 ಮತ್ತು ₹50,000 ನಡುವೆ ಇದ್ದವು (ಸಾಮಾನ್ಯ {m}): PAN ಮಿತಿ ತಪ್ಪಿಸಲು ಮೊತ್ತ ವಿಭಜನೆ.",
        "n_struct_50k": "₹50,000 ಕ್ಕಿಂತ ಸ್ವಲ್ಪ ಕಡಿಮೆ {v} ವಹಿವಾಟುಗಳು (ಸಾಮಾನ್ಯ {m}).",
        "round_1k_share": "{v} ಮೊತ್ತಗಳು ₹1,000 ದ ಪೂರ್ಣ ಗುಣಕಗಳು (ಸಾಮಾನ್ಯ {m}).",
        "mobile_spike_ratio": "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಬದಲಾದ 60 ದಿನಗಳಲ್ಲಿ ಚಟುವಟಿಕೆ {v} ಹೆಚ್ಚಾಗಿದೆ (ಸಾಮಾನ್ಯ {m}): ಖಾತೆ ಕಬಳಿಕೆಯ ಶಂಕೆ.",
        "account_age_days": "ಖಾತೆ {v} ಹಳೆಯದು (ಸಾಮಾನ್ಯ {m}).",
        "volume_to_balance": "ಮಾಸಿಕ ಜಮೆ ಸರಾಸರಿ ಬಾಕಿಯ {v} (ಸಾಮಾನ್ಯ {m}): ಆದಾಯಕ್ಕೆ ಹೊಂದಿಕೆಯಾಗುವುದಿಲ್ಲ.",
        "night_share": "{v} ವಹಿವಾಟುಗಳು ರಾತ್ರಿ 11 ರಿಂದ ಬೆಳಿಗ್ಗೆ 5 ರ ನಡುವೆ ನಡೆದಿವೆ (ಸಾಮಾನ್ಯ {m}).",
        "ch_atm_wd": "{v} ವಹಿವಾಟುಗಳು ATM ನಗದು ಹಿಂಪಡೆಯುವಿಕೆ (ಸಾಮಾನ್ಯ {m}).",
        "reg_cp_flagged": "{v} ವಹಿವಾಟುದಾರರು ಇತರ ಬ್ಯಾಂಕುಗಳ ದೃಢಪಡಿಸಿದ ಮ್ಯೂಲ್ ಖಾತೆಗಳೊಂದಿಗೂ ಸಂಬಂಧ ಹೊಂದಿದ್ದಾರೆ (ಸಾಮಾನ್ಯ {m}).",
        "reg_cp_share": "{v} ವಹಿವಾಟುದಾರರು ಒಕ್ಕೂಟದ ಶಂಕಿತ ಪಟ್ಟಿಯಲ್ಲಿದ್ದಾರೆ (ಸಾಮಾನ್ಯ {m}).",
        "reg_ip_shared_mule": "ದೃಢಪಡಿಸಿದ ಮ್ಯೂಲ್ ಖಾತೆಗಳೊಂದಿಗೆ {v} IP/ಸಾಧನಗಳನ್ನು ಹಂಚಿಕೊಂಡಿದೆ (ಸಾಮಾನ್ಯ {m}).",
        "txn_per_cp": "ಪ್ರತಿ ವಹಿವಾಟುದಾರರಿಗೆ ಕೇವಲ {v} ವಹಿವಾಟುಗಳು (ಸಾಮಾನ್ಯ {m}): ಅನೇಕ ಒಂದು-ಬಾರಿಯ ಪಕ್ಷಗಳು, ಮ್ಯೂಲ್ ಸಂಗ್ರಹದ ಸೂಚನೆ.",
        "n_cp": "{v} ವಿಭಿನ್ನ ವಹಿವಾಟುದಾರರೊಂದಿಗೆ ವ್ಯವಹಾರ (ಸಾಮಾನ್ಯ {m}).",
        "active_day_density": "ಜೀವಿತಾವಧಿಯ ಕೇವಲ {v} ದಿನಗಳಲ್ಲಿ ಸಕ್ರಿಯ (ಸಾಮಾನ್ಯ {m}): ಹಠಾತ್ ಚಟುವಟಿಕೆ, ನಂತರ ಮೌನ.",
        "ch_pos": "ಕೇವಲ {v} ವಹಿವಾಟುಗಳು ಕಾರ್ಡ್ ಖರೀದಿಗಳು (ಸಾಮಾನ್ಯ {m}): ದೈನಂದಿನ ಸಾಮಾನ್ಯ ಖರ್ಚು ಬಹಳ ಕಡಿಮೆ.",
        "mh_max_night_1d": "ಒಂದೇ ದಿನದಲ್ಲಿ ರಾತ್ರಿಯ (11 ರಿಂದ ಬೆಳಿಗ್ಗೆ 7) {v} ವರೆಗೆ ವಹಿವಾಟುಗಳು (ಸಾಮಾನ್ಯ {m}).",
        "mh_max_txn_1d": "ಒಂದೇ ದಿನದಲ್ಲಿ {v} ವರೆಗೆ ವಹಿವಾಟುಗಳು (ಸಾಮಾನ್ಯ {m}).",
        "mh_conc_credit_3m_max": "3 ನಿಮಿಷಗಳಲ್ಲಿ {v} ವರೆಗೆ ಜಮೆಗಳು (ಸಾಮಾನ್ಯ {m}): ಸಂಘಟಿತ ಸಂಗ್ರಹ.",
        "mh_conc_debit_3m_max": "3 ನಿಮಿಷಗಳಲ್ಲಿ {v} ವರೆಗೆ ಹಿಂಪಡೆಯುವಿಕೆ (ಸಾಮಾನ್ಯ {m}): ವೇಗದ ನಗದೀಕರಣ.",
        "round_5k_share": "{v} ಮೊತ್ತಗಳು ₹5,000 ದ ಪೂರ್ಣ ಗುಣಕಗಳು (ಸಾಮಾನ್ಯ {m}).",
    },
}


def localise(reasons, mitig, lang):
    """Rewrite reason sentences in `lang` ('hi' / 'kn'); untranslated ones stay in English."""
    t = I18N.get(lang)
    if not t:
        return reasons, mitig

    def one(r):
        if r is None or r["feature"] not in t or "value" not in r:
            return r
        fmt = TEMPLATES.get(r["feature"], (None, lambda v: f"{v:,.3g}", None))[1]
        txt = t[r["feature"]].format(v=_fmt(fmt, r["value"]), m=_fmt(fmt, r["typical"]))
        return {**r, "text": txt.replace(" days", {"hi": " दिन", "kn": " ದಿನಗಳು"}[lang])}
    return [one(r) for r in reasons], one(mitig)
