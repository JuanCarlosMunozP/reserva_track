from django.db.models import ProtectedError
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from common.permissions import HasRolePermission

from .api_serializers import (
    AreaSerializer,
    BranchSerializer,
    CitySerializer,
    DepartmentSerializer,
    LocationSerializer,
)
from .models import Area, Branch, City, Department, Location


class ProtectedDeleteMixin:
    """Un elemento con dependencias (FK PROTECT) no se borra: responde 409."""

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "No se puede eliminar: tiene elementos que dependen de él."},
                status=status.HTTP_409_CONFLICT,
            )


class BranchViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Branch.objects.all().order_by("name")
    serializer_class = BranchSerializer
    permission_resource = "branches"
    search_fields = ("name",)
    ordering_fields = ("name",)

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return (permissions.AllowAny(),)
        return (permissions.IsAuthenticated(), HasRolePermission())


class _CatalogViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Catálogo de lectura pública; escritura solo con permiso de rol."""

    search_fields = ("name",)
    ordering_fields = ("name",)

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return (permissions.AllowAny(),)
        return (permissions.IsAuthenticated(), HasRolePermission())


class DepartmentViewSet(_CatalogViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_resource = "branches"


class CityViewSet(_CatalogViewSet):
    queryset = City.objects.select_related("department")
    serializer_class = CitySerializer
    permission_resource = "branches"
    filterset_fields = ("department",)


class AreaViewSet(_CatalogViewSet):
    queryset = Area.objects.all()
    serializer_class = AreaSerializer
    permission_resource = "branches"


class LocationViewSet(_CatalogViewSet):
    queryset = Location.objects.select_related("branch", "area")
    serializer_class = LocationSerializer
    permission_resource = "branches"
    filterset_fields = ("branch", "area")
    search_fields = ("detail",)
    ordering_fields = ("detail",)
