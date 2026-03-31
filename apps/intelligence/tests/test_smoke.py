from narad.main import create_app


def test_core_routes_registered() -> None:
    app = create_app()
    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert "/api/admin/sources" in paths
    assert "/api/admin/pipeline/status" in paths
    assert "/api/admin/maintenance/create-partition" in paths
