"""UAE regional constants used by TaxMate orchestration and validation."""

UAE_COUNTRY = "United Arab Emirates"

UAE_EMIRATES = (
	"Abu Dhabi",
	"Ajman",
	"Dubai",
	"Fujairah",
	"Ras Al Khaimah",
	"Sharjah",
	"Umm Al Quwain",
)

# FTA TRN is a 15-digit numeric identifier
UAE_TRN_LENGTH = 15

# Tax template titles created by ERPNext for UAE companies
UAE_VAT_TAX_TEMPLATES = (
	"UAE VAT 5%",
	"UAE VAT Zero",
	"UAE VAT Exempted",
)

UAE_TAX_PRINT_FORMATS = (
	"Simplified Tax Invoice",
	"Detailed Tax Invoice",
	"Tax Invoice",
)
