__version__ = "0.1.0.0"

# Install entity-scoped workflow resolution
try:
	from taxmate.workflow.company_workflow import install_workflow_patch
	install_workflow_patch()
except Exception:
	pass
