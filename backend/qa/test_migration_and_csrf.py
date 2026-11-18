"""Migración de datos branches.0002 (con modelos simulados: el esquema ya no existe) y
callback interno de enforce_csrf."""
import importlib
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.http import HttpResponse
from rest_framework import exceptions

from common import authentication

migration = importlib.import_module("branches.migrations.0002_normalize_catalog")


# ------------------------------------------------------------------ CSRF
def test_enforce_csrf_invokes_the_inert_callback_and_passes():
    seen = {}

    class FakeCheck:
        def __init__(self, get_response):
            self.get_response = get_response

        def process_request(self, request):
            pass

        def process_view(self, request, callback, args, kwargs):
            seen["response"] = callback(request)  # el callback es inerte: devuelve 200 vacío
            return None

    with patch.object(authentication, "CSRFCheck", FakeCheck):
        assert authentication.enforce_csrf(object()) is None
    assert isinstance(seen["response"], HttpResponse) and seen["response"].status_code == 200


def test_enforce_csrf_raises_when_check_returns_reason():
    class Failing:
        def __init__(self, get_response):
            pass

        def process_request(self, request):
            pass

        def process_view(self, *args):
            return "CSRF cookie not set."

    with patch.object(authentication, "CSRFCheck", Failing):
        with pytest.raises(exceptions.PermissionDenied, match="CSRF Failed"):
            authentication.enforce_csrf(object())


# --------------------------------------------------------- backfill (fakes)
class Rows(list):
    def first(self):
        return self[0] if self else None


class Row(SimpleNamespace):
    def save(self, update_fields=None):
        self.saved = update_fields


class Manager:
    def __init__(self, rows=None, filt=None):
        self.rows = rows or []
        self.filt = filt

    def all(self):
        return self.rows

    def values_list(self, field, flat=False):
        return [getattr(r, field) for r in self.rows]

    def filter(self, **kwargs):
        (key, value), = kwargs.items()
        return Rows(r for r in self.filt if getattr(r, key) is value)

    def get_or_create(self, **kwargs):
        row = Row(pk=999, **kwargs)
        self.rows.append(row)
        self.created = getattr(self, "created", 0) + 1
        return row, True


def fake_apps(departments=(), areas=(), branches=(), cities=(), locations=()):
    models = {
        "Department": SimpleNamespace(__name__="Department", objects=Manager(list(departments))),
        "Area": SimpleNamespace(__name__="Area", objects=Manager(list(areas))),
        "Branch": SimpleNamespace(__name__="Branch", objects=Manager(list(branches))),
        "City": SimpleNamespace(__name__="City", objects=Manager(list(cities))),
        "Location": SimpleNamespace(__name__="Location", objects=Manager([], filt=list(locations))),
    }
    apps = SimpleNamespace(get_model=lambda app, name: models[name])
    return apps, models


def test_backfill_aborts_on_duplicate_names_in_unique_tables():
    for table in ("departments", "areas", "branches"):
        dup = [Row(name="X"), Row(name="X")]
        apps, _ = fake_apps(**{table: dup})
        with pytest.raises(RuntimeError, match="Nombres duplicados"):
            migration.backfill(apps, None)


def test_backfill_infers_department_and_branch_city_from_locations():
    c1 = Row(name="Cali", department_id=None)
    c2 = Row(name="Bogotá", department_id=None)
    orphan1 = Row(name="Sin loc 1", department_id=None)
    orphan2 = Row(name="Sin loc 2", department_id=None)
    b_with = Row(name="Sede A", city_id=None)
    b_without = Row(name="Sede B", city_id=None)
    locs = [
        Row(city=c1, department_id=7, city_id=11, branch=b_with),
        Row(city=c2, department_id=8, city_id=12, branch=None),
    ]
    apps, models = fake_apps(cities=[c1, c2, orphan1, orphan2], branches=[b_with, b_without], locations=locs)
    migration.backfill(apps, None)

    assert (c1.department_id, c2.department_id) == (7, 8)
    # las ciudades sin Location comparten un único departamento comodín
    assert orphan1.department_id == orphan2.department_id == 999
    assert models["Department"].objects.created == 1
    assert c1.saved == ["department"]
    assert b_with.city_id == 11 and b_with.saved == ["city"]
    assert b_without.city_id is None and not hasattr(b_without, "saved")


def test_backfill_aborts_on_duplicate_city_inside_same_department():
    a = Row(name="Cali", department_id=7)
    b = Row(name="Cali", department_id=7)
    locs = [Row(city=a, department_id=7, city_id=1, branch=None), Row(city=b, department_id=7, city_id=2, branch=None)]
    apps, _ = fake_apps(cities=[a, b], locations=locs)
    with pytest.raises(RuntimeError, match="Ciudades duplicadas"):
        migration.backfill(apps, None)
